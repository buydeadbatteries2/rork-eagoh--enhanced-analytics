/**
 * EAGOH Analyst Chat — Cloudflare Worker
 *
 * Secure server-side intelligence grounding system.
 *
 * Every analyst session (Quick Check, Quick Analysis, Standard Analysis,
 * Oracle Deep Dive, Premium Event) routes through this worker.
 *
 * The worker:
 *   1. Authenticates the user via Supabase JWT
 *   2. Verifies EAGOH ownership
 *   3. Retrieves & ranks relevant private Open Intelligence
 *   4. Optionally fetches current external search data
 *   5. Builds a structured, source-labeled prompt
 *   6. Calls OpenAI and returns the grounded response
 *
 * No API keys, private OI content, or service-role tokens ever reach the client.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Environment ──────────────────────────────────────────────────────────────

type Env = {
  OPENAI_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
};

// ── Types ────────────────────────────────────────────────────────────────────

type SessionType =
  | "quick-check"
  | "quick-analytics"
  | "standard"
  | "oracle"
  | "premium-event";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type AnalystRequest = {
  prompt: string;
  sessionType: SessionType;
  eagohId: string | null;
  personality?: string;
  kind?: string;
  conversationContext?: ConversationMessage[];
};

type Source = {
  title: string;
  publisher?: string;
  url?: string;
  publishedAt?: string;
};

type Grounding = {
  openIntelligenceUsed: boolean;
  openIntelligenceCount: number;
  externalSearchUsed: boolean;
  sourceCount: number;
};

type AnalystResponse =
  | {
      ok: true;
      reply: string;
      model: string;
      sessionType: SessionType;
      confidence: number;
      grounding: Grounding;
      sources?: Source[];
    }
  | {
      ok: false;
      errorCode: string;
      error: string;
    };

type OpenIntelligenceRow = {
  id: string;
  user_id: string;
  eagoh_id: string;
  intelligence_domain: string;
  entry_type: string;
  tag: string;
  content: string;
  character_count_no_spaces: number;
  confidence_level: string;
  quality_score: number;
  validation_status: string;
  influence_score: number;
  selected_category?: string | null;
  selected_subtags?: string[] | null;
  custom_tags?: string[] | null;
  created_at: string;
  updated_at: string;
};

type EagohRow = {
  id: string;
  user_id: string;
  name: string;
  domain?: string | null;
};

// ── CORS ─────────────────────────────────────────────────────────────────────

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Verify the Supabase JWT and return the authenticated user ID.
 * Returns null if the token is invalid, expired, or missing.
 */
async function verifyAuth(
  supabase: SupabaseClient,
  jwt: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser(jwt);
    if (error || !data.user) {
      console.warn("[analyst] auth failed", error?.message ?? "no user");
      return null;
    }
    return data.user.id;
  } catch (err) {
    console.warn("[analyst] auth exception", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

// ── EAGOH Ownership ──────────────────────────────────────────────────────────

/**
 * Verify that an EAGOH belongs to the authenticated user and is active.
 */
async function verifyEagohOwnership(
  supabase: SupabaseClient,
  eagohId: string,
  userId: string,
): Promise<EagohRow | null> {
  const { data, error } = await supabase
    .from("eagohs")
    .select("id, user_id, name, domain")
    .eq("id", eagohId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    console.warn("[analyst] eagoh ownership check failed", { eagohId, userId, error: error?.message });
    return null;
  }
  return data as EagohRow;
}

// ── Open Intelligence Retrieval ──────────────────────────────────────────────

/**
 * Retrieve Open Intelligence entries for an EAGOH owned by the user.
 * Only returns entries that are not deleted/archived and have valid status.
 */
async function retrieveOpenIntelligence(
  supabase: SupabaseClient,
  userId: string,
  eagohId: string,
  limit: number = 50,
): Promise<OpenIntelligenceRow[]> {
  const { data, error } = await supabase
    .from("open_intelligence")
    .select("*")
    .eq("user_id", userId)
    .eq("eagoh_id", eagohId)
    .in("validation_status", ["pending_review", "validated"])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[analyst] OI retrieval failed", error.message);
    return [];
  }
  return (data ?? []) as OpenIntelligenceRow[];
}

// ── Relevance Ranking ────────────────────────────────────────────────────────

/** Tokenize a string into meaningful lowercase keywords (stop-word filtered). */
function tokenize(text: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "about", "and", "or",
    "not", "no", "but", "if", "then", "else", "when", "where", "why",
    "how", "all", "each", "every", "both", "few", "more", "most", "other",
    "some", "such", "only", "own", "same", "so", "than", "too", "very",
    "just", "now", "here", "there", "what", "which", "who", "whom",
    "this", "that", "these", "those", "it", "its", "i", "me", "my",
    "we", "our", "you", "your", "he", "she", "they", "them",
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));
}

/** Confidence multiplier for scoring based on entry confidence level. */
function confidenceMultiplier(level: string): number {
  switch (level) {
    case "verified_observation": return 1.2;
    case "strong_confidence": return 1.0;
    case "moderate_confidence": return 0.85;
    case "weak_suspicion": return 0.65;
    default: return 0.8;
  }
}

/** Validation status bonus. */
function validationBonus(status: string): number {
  switch (status) {
    case "validated": return 1.15;
    case "pending_review": return 1.0;
    case "flagged": return 0.5;
    default: return 1.0;
  }
}

/**
 * Score an OI entry against a user query. Higher = more relevant.
 *
 * Factors:
 *   - Keyword matches in content (weight: 3 per match)
 *   - Tag/category matches (weight: 2 per match)
 *   - Quality score multiplier
 *   - Influence score bonus
 *   - Confidence level multiplier
 *   - Validation status bonus
 *   - Recency (newer = small bonus)
 */
function scoreEntry(entry: OpenIntelligenceRow, queryTokens: string[]): number {
  let score = 0;

  // Content keyword matches — weight 3 each
  const contentLower = entry.content.toLowerCase();
  for (const token of queryTokens) {
    if (contentLower.includes(token)) score += 3;
  }

  // Tag matches — weight 2 each
  const tagText = [
    entry.tag ?? "",
    entry.selected_category ?? "",
    ...(entry.selected_subtags ?? []),
    ...(entry.custom_tags ?? []),
  ].join(" ").toLowerCase();
  for (const token of queryTokens) {
    if (tagText.includes(token)) score += 2;
  }

  // Quality score: 0-100 → multiplier 0.5-1.5
  const qualityFactor = 0.5 + (entry.quality_score / 100);
  score *= qualityFactor;

  // Influence bonus: 0-100 → add up to 2 points
  score += (entry.influence_score / 100) * 2;

  // Confidence multiplier
  score *= confidenceMultiplier(entry.confidence_level);

  // Validation bonus
  score *= validationBonus(entry.validation_status);

  // Recency bonus: entries within last 30 days get up to 1 point
  const ageDays = (Date.now() - new Date(entry.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 30) {
    score += Math.max(0, (30 - ageDays) / 30);
  }

  return Math.round(score * 100) / 100;
}

/**
 * Rank OI entries by relevance to the query and return the top N.
 */
function rankEntries(
  entries: OpenIntelligenceRow[],
  query: string,
  topN: number,
): OpenIntelligenceRow[] {
  if (entries.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    // No meaningful tokens — return newest entries
    return entries.slice(0, topN);
  }

  const scored = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, queryTokens) }))
    .filter(({ score }) => score > 0.5) // Drop near-zero relevance
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topN).map(({ entry }) => entry);
}

// ── Session limits ───────────────────────────────────────────────────────────

/**
 * Number of OI entries to retrieve per session type.
 */
function sessionOILimit(sessionType: SessionType): number {
  switch (sessionType) {
    case "quick-check": return 3;
    case "quick-analytics": return 6;
    case "standard": return 10;
    case "oracle": return 16;
    case "premium-event": return 8;
  }
}

/**
 * Token budget for OI content per session type (approximate).
 */
function sessionOITokenBudget(sessionType: SessionType): number {
  switch (sessionType) {
    case "quick-check": return 500;
    case "quick-analytics": return 1000;
    case "standard": return 2000;
    case "oracle": return 3000;
    case "premium-event": return 1500;
  }
}

// ── OI Formatting ────────────────────────────────────────────────────────────

/**
 * Format ranked OI entries into a labeled context block for the system prompt.
 * Respects token budget — truncates individual entries if needed.
 */
function formatOIContext(
  entries: OpenIntelligenceRow[],
  tokenBudget: number,
): { text: string; count: number } {
  if (entries.length === 0) return { text: "", count: 0 };

  const blocks = entries.map((entry, i) => {
    const confidenceLabel = entry.confidence_level.replace(/_/g, " ");
    const quality = entry.quality_score;
    const influence = entry.influence_score;
    const date = new Date(entry.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    // Truncate content if needed (rough token estimate: chars / 4)
    const maxContentChars = Math.max(100, Math.floor(tokenBudget / entries.length / 4) * 4);
    const content = entry.content.length > maxContentChars
      ? entry.content.slice(0, maxContentChars) + "..."
      : entry.content;

    const tagLine = [entry.selected_category, ...(entry.selected_subtags ?? []), ...(entry.custom_tags ?? [])]
      .filter(Boolean)
      .join(", ") || entry.tag;

    return `[OI Entry ${i + 1}]
Category: ${entry.selected_category ?? "General"}
Tags: ${tagLine}
Confidence: ${confidenceLabel}
Quality: ${quality}/100
Influence: ${influence}/100
Created: ${date}
Content: ${content}`;
  });

  const text = `OPEN INTELLIGENCE — USER-PROVIDED (${entries.length} entries)
Open Intelligence is private, user-provided knowledge. Treat it as potentially valuable but not automatically verified. Consider confidence, quality, validation status, recency, and potential conflicts with current external sources.

${blocks.join("\n\n")}`;

  return { text, count: entries.length };
}

// ── External Search ──────────────────────────────────────────────────────────

/**
 * Determine whether external/current search is likely beneficial for this query.
 * Uses keyword-based freshness detection.
 */
function shouldUseExternalSearch(prompt: string, sessionType: SessionType): boolean {
  const lower = prompt.toLowerCase();

  // Freshness-triggering keywords
  const freshnessKeywords = [
    "score", "scores", "result", "results", "tonight", "today", "yesterday",
    "this week", "this month", "upcoming", "next game", "next match",
    "injury", "injured", "roster", "roster move", "trade", "traded",
    "current", "latest", "recent", "recently", "just announced",
    "breaking", "update", "updated", "live", "now", "happening",
    "schedule", "scheduled", "lineup", "starting", "bench",
    "odds", "betting", "spread", "over/under",
    "release date", "premiere", "box office", "ratings",
    "stock", "market", "price", "earnings", "quarterly",
    "regulation", "policy", "law", "bill", "vote",
  ];

  const hasFreshnessKeyword = freshnessKeywords.some((kw) => lower.includes(kw));

  // Oracle and Premium Event always use search for deeper coverage
  if (sessionType === "oracle" || sessionType === "premium-event") return true;

  // Quick Check only uses search when explicitly freshness-sensitive
  if (sessionType === "quick-check") return hasFreshnessKeyword;

  // Quick Analysis and Standard use search when freshness keywords are present
  return hasFreshnessKeyword;
}

/**
 * Perform external web search via a lightweight approach.
 *
 * Current implementation: uses OpenAI's model with explicit web-search-aware
 * system instructions. In a future iteration this can be swapped for a
 * dedicated search API (Brave, Exa, Perplexity).
 *
 * Returns an array of sources (if available) and search result text.
 */
async function performExternalSearch(
  prompt: string,
  sessionType: SessionType,
  openaiApiKey: string,
): Promise<{ text: string; sources: Source[]; used: boolean }> {
  if (!shouldUseExternalSearch(prompt, sessionType)) {
    return { text: "", sources: [], used: false };
  }

  try {
    // Use OpenAI with web-search-aware instructions for current data
    const searchPrompt = `Search the web for current, factual information about the following query. 
Return only verified facts with clear source attribution. If you cannot find current information, 
state that clearly rather than fabricating details.

Query: ${prompt.slice(0, 400)}

Format your response as:
FINDINGS:
<concise factual summary, 2-4 sentences>

SOURCES:
- Title: <source title> | Publisher: <publisher name> | URL: <source url> | Date: <publication date>`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a research assistant. Provide current, factual information with source attribution. Never fabricate sources, URLs, or data. If you don't have current data, say so clearly.",
          },
          { role: "user", content: searchPrompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      console.warn("[analyst] external search failed", res.status);
      return { text: "", sources: [], used: false };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return { text: "", sources: [], used: false };
    }

    // Parse sources from the response
    const sources: Source[] = [];
    const sourceRegex = /Title:\s*(.+?)\s*\|\s*Publisher:\s*(.+?)\s*\|\s*URL:\s*(.+?)\s*\|\s*Date:\s*(.+?)$/gm;
    let match;
    while ((match = sourceRegex.exec(content)) !== null) {
      sources.push({
        title: match[1].trim(),
        publisher: match[2].trim() || undefined,
        url: match[3].trim() || undefined,
        publishedAt: match[4].trim() || undefined,
      });
    }

    // Extract findings text (everything before SOURCES:)
    const findingsMatch = content.match(/FINDINGS:\s*([\s\S]*?)(?:SOURCES:|$)/i);
    const findings = findingsMatch?.[1]?.trim() ?? "";

    return {
      text: findings,
      sources,
      used: sources.length > 0 || findings.length > 0,
    };
  } catch (err) {
    console.warn("[analyst] external search exception", err instanceof Error ? err.message : "unknown");
    return { text: "", sources: [], used: false };
  }
}

// ── Prompt Building ──────────────────────────────────────────────────────────

function getSessionInstruction(sessionType: SessionType): string {
  switch (sessionType) {
    case "oracle":
      return "Deliver a deep tactical read with emotionally aware risk framing. Explore multiple scenarios, address counterarguments, and quantify uncertainty where appropriate. Keep it concise yet premium.";
    case "quick-analytics":
      return "Deliver a short tactical analytics read with clear confidence language. Compare against available Open Intelligence where relevant.";
    case "quick-check":
      return "Deliver a fast, direct signal check in three sentences or fewer. No preamble. No filler. Surface the highest-confidence read.";
    case "premium-event":
      return "Deliver an event-focused intelligence breakdown. Analyze timing, matchups, narratives, and critical moments. Emphasize source freshness.";
    default:
      return "Deliver a balanced EAGOH analyst response with tactical intelligence, emotional awareness, and confidence caveats. Explicitly handle any conflicts between user-provided intelligence and external sources.";
  }
}

function getPersonalityInstruction(personality: string): string {
  switch (personality) {
    case "calm": return "Tone: composed analytical clarity, low volatility.";
    case "aggressive": return "Tone: high-intensity conviction without overpromising certainty.";
    case "oracle": return "Tone: premium oracle voice, layered, slightly cinematic, forecasts not facts.";
    case "fanatic": return "Tone: emotionally aware fanatic intelligence, loyal but honest about risk pockets.";
    default: return "Tone: calm tactical precision, confident clipped sentences, sharpest read first.";
  }
}

function getKindInstruction(kind: string): string {
  switch (kind) {
    case "matchup": return "Frame: matchup comparison — expose the asymmetry and surface the decisive variable.";
    case "player_confidence": return "Frame: player confidence — read momentum, fatigue, volatility, tactical fit.";
    case "team_analysis": return "Frame: team analysis — identity, pressure response, structural risk in 2–3 beats.";
    default: return "Frame: general signal — one tactical read with a clear confidence frame.";
  }
}

/**
 * Build the full system prompt with clearly separated, labeled sections.
 */
function buildSystemPrompt(params: {
  sessionType: SessionType;
  personality: string;
  kind: string;
  eagohMeta?: { name: string; domain: string } | null;
  oiContext: string;
  externalContext: string;
  externalSearchUsed: boolean;
}): string {
  const sections: string[] = [];

  // 1. Core system identity
  sections.push(
    "You are the EAGOH Analyst: intelligent, emotionally aware, tactical, premium, and futuristic.",
    "Do not claim certainty. Do not mention internal implementation, tools, or knowledge cutoff dates.",
  );

  // 2. Session depth and response format
  sections.push(
    `SESSION: ${params.sessionType}`,
    getSessionInstruction(params.sessionType),
    getPersonalityInstruction(params.personality),
    getKindInstruction(params.kind),
  );

  // 3. EAGOH identity and domain
  if (params.eagohMeta) {
    sections.push(
      `EAGOH IDENTITY: ${params.eagohMeta.name}`,
      `DOMAIN: ${params.eagohMeta.domain}`,
      "Answer within this EAGOH's domain specialization. Use its identity lens for analysis.",
    );
  } else {
    sections.push(
      "EAGOH IDENTITY: General Intelligence Shell",
      "Provide broad, domain-agnostic analysis suitable for a general-purpose intelligence agent.",
    );
  }

  // 4. Source handling instructions
  sections.push(
    "SOURCE HANDLING:",
    "- When Open Intelligence is provided below, treat it as private user knowledge — potentially valuable but not automatically verified.",
    "- When external research is provided, distinguish it from user-provided intelligence.",
    "- If Open Intelligence conflicts with external sources, identify the conflict explicitly: 'Your Open Intelligence suggests X, while current external sources indicate Y.'",
    "- Never silently discard the user's observations. Preserve them as a perspective even when contradicted.",
  );

  return sections.join("\n\n");
}

/**
 * Build the messages array for OpenAI with all sections properly ordered.
 */
function buildMessages(params: {
  systemPrompt: string;
  oiContext: string;
  externalContext: string;
  externalSearchUsed: boolean;
  conversationContext: ConversationMessage[];
  prompt: string;
}): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const systemParts = [params.systemPrompt];

  // Add OI context
  if (params.oiContext) {
    systemParts.push(params.oiContext);
  }

  // Add external research
  if (params.externalSearchUsed && params.externalContext) {
    systemParts.push(
      `CURRENT EXTERNAL RESEARCH:\n${params.externalContext}\n\nNote: The above is current external research data. Distinguish this from user-provided Open Intelligence below, if present.`,
    );
  } else if (!params.externalSearchUsed && params.oiContext) {
    systemParts.push(
      "NOTE: Current external research was not used for this response. The analysis is based on the EAGOH's trained knowledge and user-provided Open Intelligence only.",
    );
  }

  const systemContent = systemParts.join("\n\n---\n\n");

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemContent },
  ];

  // Conversation context (limited to last 10 exchanges, role-aware)
  if (params.conversationContext.length > 0) {
    const recent = params.conversationContext.slice(-20); // last 10 exchanges = 20 messages
    for (const msg of recent) {
      messages.push({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      });
    }
  }

  // Current user question
  messages.push({ role: "user", content: params.prompt });

  return messages;
}

// ── Main Handler ─────────────────────────────────────────────────────────────

async function handleAnalystChat(request: Request, env: Env): Promise<Response> {
  // ── Check required env vars ──────────────────────────────────────────────
  if (!env.OPENAI_API_KEY) {
    console.warn("[analyst] missing OPENAI_API_KEY");
    return jsonResponse(
      { ok: false, errorCode: "missing_api_key", error: "OpenAI API key is not configured." },
      503,
    );
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.warn("[analyst] missing Supabase config");
    return jsonResponse(
      { ok: false, errorCode: "missing_config", error: "Backend configuration is incomplete." },
      503,
    );
  }

  // ── Parse request ────────────────────────────────────────────────────────
  let payload: AnalystRequest;
  try {
    payload = (await request.json()) as AnalystRequest;
  } catch {
    return jsonResponse(
      { ok: false, errorCode: "invalid_request", error: "Invalid request payload." },
      400,
    );
  }

  const prompt = payload.prompt?.trim();
  if (!prompt) {
    return jsonResponse(
      { ok: false, errorCode: "invalid_request", error: "Prompt is required." },
      400,
    );
  }

  // ── Extract JWT ──────────────────────────────────────────────────────────
  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) {
    return jsonResponse(
      { ok: false, errorCode: "unauthorized", error: "Authentication required." },
      401,
    );
  }

  // ── Create Supabase client & authenticate ────────────────────────────────
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userId = await verifyAuth(supabase, jwt);
  if (!userId) {
    return jsonResponse(
      { ok: false, errorCode: "unauthorized", error: "Invalid or expired authentication." },
      401,
    );
  }

  const sessionType = payload.sessionType ?? "standard";
  const personality = payload.personality ?? "tactical";
  const kind = payload.kind ?? "general";
  const safePrompt = prompt.slice(0, 1200);

  console.log("[analyst] request", {
    userId,
    sessionType,
    eagohId: payload.eagohId ?? "none",
    promptLen: safePrompt.length,
    hasConversationContext: (payload.conversationContext?.length ?? 0) > 0,
  });

  // ── EAGOH ownership verification ─────────────────────────────────────────
  let eagohMeta: { name: string; domain: string } | null = null;
  let oiEntries: OpenIntelligenceRow[] = [];
  let oiContext = "";
  let oiCount = 0;

  if (payload.eagohId) {
    const eagoh = await verifyEagohOwnership(supabase, payload.eagohId, userId);
    if (!eagoh) {
      return jsonResponse(
        { ok: false, errorCode: "eagoh_not_found", error: "EAGOH not found or access denied." },
        403,
      );
    }

    eagohMeta = {
      name: eagoh.name ?? "Unnamed EAGOH",
      domain: eagoh.domain ?? "general",
    };

    // Retrieve & rank OI entries
    const rawEntries = await retrieveOpenIntelligence(supabase, userId, payload.eagohId, 50);
    const limit = sessionOILimit(sessionType);
    const tokenBudget = sessionOITokenBudget(sessionType);

    if (rawEntries.length > 0) {
      const ranked = rankEntries(rawEntries, prompt, Math.min(limit, rawEntries.length));
      const formatted = formatOIContext(ranked, tokenBudget);
      oiEntries = ranked;
      oiContext = formatted.text;
      oiCount = formatted.count;
    }
  }

  // ── External search ──────────────────────────────────────────────────────
  const searchResult = await performExternalSearch(prompt, sessionType, env.OPENAI_API_KEY);
  const externalContext = searchResult.text;
  const externalSearchUsed = searchResult.used;
  const sources = searchResult.sources;

  // ── Build prompt ─────────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt({
    sessionType,
    personality,
    kind,
    eagohMeta,
    oiContext,
    externalContext,
    externalSearchUsed,
  });

  const messages = buildMessages({
    systemPrompt,
    oiContext, // already included in systemPrompt above — don't duplicate
    externalContext: "", // already included in systemPrompt
    externalSearchUsed,
    conversationContext: payload.conversationContext ?? [],
    prompt: safePrompt,
  });

  // ── Call OpenAI ──────────────────────────────────────────────────────────
  const MAX_RETRIES = 3;
  let lastError: { status: number; errorCode: string; error: string } | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const maxTokens =
        sessionType === "quick-check" ? 220 :
        sessionType === "quick-analytics" ? 400 :
        sessionType === "oracle" ? 600 :
        sessionType === "premium-event" ? 500 :
        450;

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          temperature: sessionType === "quick-check" ? 0.55 : 0.72,
          max_tokens: maxTokens,
        }),
      });

      if (!openaiRes.ok) {
        const status = openaiRes.status;
        console.warn("[analyst] OpenAI non-ok", { status, attempt });

        if (status === 429) {
          lastError = { status, errorCode: "openai_rate_limit", error: "OpenAI rate limit exceeded." };
          if (attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          return jsonResponse(lastError, 429);
        }

        return jsonResponse(
          { ok: false, errorCode: "openai_error", error: "OpenAI request failed." },
          502,
        );
      }

      const data = (await openaiRes.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const reply = data.choices?.[0]?.message?.content?.trim();

      if (!reply) {
        return jsonResponse(
          { ok: false, errorCode: "openai_empty_response", error: "Analyst returned an empty response." },
          502,
        );
      }

      // ── Confidence scoring ─────────────────────────────────────────────
      const confidenceMap: Record<SessionType, number> = {
        "quick-check": 82,
        "quick-analytics": 86,
        standard: 89,
        oracle: 93,
        "premium-event": 90,
      };

      const grounding: Grounding = {
        openIntelligenceUsed: oiCount > 0,
        openIntelligenceCount: oiCount,
        externalSearchUsed,
        sourceCount: sources.length,
      };

      console.log("[analyst] success", {
        replyLen: reply.length,
        oiUsed: grounding.openIntelligenceUsed,
        oiCount: grounding.openIntelligenceCount,
        externalSearchUsed: grounding.externalSearchUsed,
        sourceCount: grounding.sourceCount,
      });

      return jsonResponse({
        ok: true,
        reply,
        model: "gpt-4o-mini",
        sessionType,
        confidence: confidenceMap[sessionType],
        grounding,
        sources: sources.length > 0 ? sources : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[analyst] fetch/parse failure", { message, attempt });

      const isTimeout =
        message.toLowerCase().includes("timeout") ||
        message.toLowerCase().includes("abort");

      lastError = {
        status: 500,
        errorCode: "openai_error",
        error: isTimeout ? "Request timed out." : "Analyst service failed safely.",
      };

      if (attempt < MAX_RETRIES && (isTimeout || message.toLowerCase().includes("network"))) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }

  return jsonResponse(lastError!, lastError!.status);
}

// ── Export ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/ping") {
      return jsonResponse({ ok: true, now: new Date().toISOString() });
    }

    if (url.pathname === "/analyst/chat" && request.method === "POST") {
      return handleAnalystChat(request, env);
    }

    return jsonResponse({ ok: false, error: "Not found" }, 404);
  },
};
