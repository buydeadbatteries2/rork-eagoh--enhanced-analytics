/**
 * EAGOH Analyst Chat — Cloudflare Worker
 *
 * Secure server-side intelligence grounding system.
 *
 * Every analyst session (Quick Check, Quick Analysis, Standard Analysis,
 * Oracle Deep Dive, Premium Event) routes through this worker.
 *
 * Phase 1 — Personal Open Intelligence grounding:
 *   1. Authenticates the user via Supabase JWT
 *   2. Verifies EAGOH ownership
 *   3. Retrieves & ranks relevant private Open Intelligence
 *   4. Builds a structured, source-labeled prompt
 *   5. Calls OpenAI and returns the grounded response
 *
 * Phase 2 — Real external web search:
 *   1. Determines whether current research is needed
 *   2. Calls OpenAI Responses API with web_search tool
 *   3. Extracts source annotations (real URLs, titles)
 *   4. Includes research summary in the final prompt
 *   5. Labels sources clearly and handles OI/external conflicts
 *
 * The worker uses the Responses API (POST /v1/responses) for search
 * and Chat Completions (POST /v1/chat/completions) for the final answer.
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
  url: string;
  publisher?: string;
  publishedAt?: string;
};

type ExternalResearchResult = {
  used: boolean;
  summary: string;
  sources: Source[];
  error?: string;
};

type PersonalGrounding = {
  personalOpenIntelligenceUsed: boolean;
  personalOpenIntelligenceCount: number;
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
      grounding: PersonalGrounding;
      sources: Source[];
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

async function retrievePersonalOpenIntelligence(
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

function confidenceMultiplier(level: string): number {
  switch (level) {
    case "verified_observation": return 1.2;
    case "strong_confidence": return 1.0;
    case "moderate_confidence": return 0.85;
    case "weak_suspicion": return 0.65;
    default: return 0.8;
  }
}

function validationBonus(status: string): number {
  switch (status) {
    case "validated": return 1.15;
    case "pending_review": return 1.0;
    case "flagged": return 0.5;
    default: return 1.0;
  }
}

function scoreEntry(entry: OpenIntelligenceRow, queryTokens: string[]): number {
  let score = 0;

  const contentLower = entry.content.toLowerCase();
  for (const token of queryTokens) {
    if (contentLower.includes(token)) score += 3;
  }

  const tagText = [
    entry.tag ?? "",
    entry.selected_category ?? "",
    ...(entry.selected_subtags ?? []),
    ...(entry.custom_tags ?? []),
  ].join(" ").toLowerCase();
  for (const token of queryTokens) {
    if (tagText.includes(token)) score += 2;
  }

  const qualityFactor = 0.5 + (entry.quality_score / 100);
  score *= qualityFactor;

  score += (entry.influence_score / 100) * 2;

  score *= confidenceMultiplier(entry.confidence_level);

  score *= validationBonus(entry.validation_status);

  const ageDays = (Date.now() - new Date(entry.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 30) {
    score += Math.max(0, (30 - ageDays) / 30);
  }

  return Math.round(score * 100) / 100;
}

function rankEntries(
  entries: OpenIntelligenceRow[],
  query: string,
  topN: number,
): OpenIntelligenceRow[] {
  if (entries.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return entries.slice(0, topN);
  }

  const scored = entries
    .map((entry) => ({ entry, score: scoreEntry(entry, queryTokens) }))
    .filter(({ score }) => score > 0.5)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, topN).map(({ entry }) => entry);
}

// ── Session limits ───────────────────────────────────────────────────────────

function sessionOILimit(sessionType: SessionType): number {
  switch (sessionType) {
    case "quick-check": return 3;
    case "quick-analytics": return 6;
    case "standard": return 10;
    case "oracle": return 16;
    case "premium-event": return 10;
  }
}

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

  const text = `PERSONAL OPEN INTELLIGENCE — USER PROVIDED (${entries.length} entries)
Personal Open Intelligence is private, user-provided knowledge. Treat it as potentially valuable real-world experience, but not automatically verified fact. Consider relevance, confidence, validation status, quality, and recency.

${blocks.join("\n\n")}`;

  return { text, count: entries.length };
}

// ── External Web Search ──────────────────────────────────────────────────────

/**
 * Determines whether external web search is needed based on the prompt
 * and session type. Uses a deterministic keyword heuristic.
 *
 * Premium Event sessions always enable search.
 * Freshness-related keywords (current, latest, today, scores, etc.)
 * trigger search for other session types.
 */
function shouldUseExternalSearch(prompt: string, sessionType: SessionType): boolean {
  if (sessionType === "premium-event") return true;

  const lower = prompt.toLowerCase();

  const freshnessTriggers = [
    "current",
    "latest",
    "today",
    "tonight",
    "yesterday",
    "this week",
    "upcoming",
    "recent",
    "live",
    "right now",
    "happening",
    "breaking",
    "just announced",
    "roster",
    "injury",
    "injuries",
    "schedule",
    "standings",
    "score",
    "scores",
    "release",
    "releases",
    "new album",
    "new movie",
    "new single",
    "new season",
    "price",
    "prices",
    "stock",
    "market",
    "news",
    "update",
    "regulation",
    "policy",
    "law",
    "launched",
    "announced",
    "this month",
    "this year",
  ];

  for (const trigger of freshnessTriggers) {
    if (lower.includes(trigger)) return true;
  }

  // Named events with recent/current years
  if (/\b202[4-6]\b/.test(prompt)) return true;

  // Month + year pattern (e.g. "June 2026")
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i.test(prompt)) return true;

  // Named sports/entertainment events with date context
  if (/\b(playoffs|finals|championship|tournament|draft|awards|grammy|oscar|emmy|super bowl|world series|world cup)\b/i.test(prompt)) return true;

  return false;
}

/**
 * Build a safe search query using only public concepts from the prompt.
 * Never includes private Open Intelligence content.
 */
function buildSearchQuery(prompt: string, eagohDomain?: string | null): string {
  let query = prompt.slice(0, 300).trim();

  if (eagohDomain && eagohDomain !== "general" && eagohDomain !== "unknown") {
    query = `${query} ${eagohDomain}`;
  }

  return query;
}

/**
 * Map session type to search context size for the Responses API.
 */
function searchContextSize(sessionType: SessionType): "low" | "medium" | "high" {
  switch (sessionType) {
    case "quick-check":
    case "quick-analytics":
      return "low";
    case "oracle":
      return "high";
    default:
      return "medium";
  }
}

/**
 * Extract a human-readable title from a URL (uses hostname).
 */
function extractTitleFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname;
  } catch {
    return url;
  }
}

/**
 * Extract source annotations from an OpenAI Responses API response.
 *
 * Looks for:
 *   - web_search_call items → action.sources (URLs from search results)
 *   - message items → content blocks → url_citation annotations (titles + URLs)
 *
 * Deduplicates by normalized URL.
 */
function extractSources(data: Record<string, unknown>): Source[] {
  const sources: Source[] = [];
  const seenUrls = new Set<string>();

  const output = data.output as Array<Record<string, unknown>> | undefined;
  if (!output || !Array.isArray(output)) return sources;

  for (const item of output) {
    // web_search_call: contains raw search result URLs
    if (item.type === "web_search_call") {
      const action = item.action as Record<string, unknown> | undefined;
      const srcs = action?.sources as Array<{ type?: string; url?: string }> | undefined;
      if (srcs) {
        for (const src of srcs) {
          const normalizedUrl = (src.url ?? "").trim().replace(/\/$/, "");
          if (src.type === "url" && normalizedUrl && !seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl);
            sources.push({ title: extractTitleFromUrl(normalizedUrl), url: normalizedUrl });
          }
        }
      }
    }

    // message: may contain url_citation annotations with proper titles
    if (item.type === "message") {
      const content = item.content as Array<Record<string, unknown>> | undefined;
      if (content) {
        for (const block of content) {
          if (block.type === "output_text") {
            const annotations = block.annotations as Array<Record<string, unknown>> | undefined;
            if (annotations) {
              for (const ann of annotations) {
                if (ann.type === "url_citation") {
                  const normalizedUrl = ((ann.url as string) ?? "").trim().replace(/\/$/, "");
                  if (normalizedUrl && !seenUrls.has(normalizedUrl)) {
                    seenUrls.add(normalizedUrl);
                    sources.push({
                      title: (ann.title as string) || extractTitleFromUrl(normalizedUrl),
                      url: normalizedUrl,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // Validate URLs
  return sources.filter((s) => {
    try {
      const parsed = new URL(s.url);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  });
}

/**
 * Extract the search-grounded summary text from a Responses API response.
 */
function extractSearchSummary(data: Record<string, unknown>): string {
  const output = data.output as Array<Record<string, unknown>> | undefined;
  if (!output || !Array.isArray(output)) return "";

  const texts: string[] = [];
  for (const item of output) {
    if (item.type === "message") {
      const content = item.content as Array<Record<string, unknown>> | undefined;
      if (content) {
        for (const block of content) {
          if (block.type === "output_text" && typeof block.text === "string") {
            texts.push(block.text);
          }
        }
      }
    }
  }

  return texts.join("\n\n");
}

/**
 * Perform real web search via OpenAI Responses API with web_search tool.
 *
 * Returns structured results with verified source annotations.
 * Never fabricates URLs, titles, or publishers.
 */
async function performWebSearch(
  query: string,
  apiKey: string,
  sessionType: SessionType,
): Promise<ExternalResearchResult> {
  const contextSize = searchContextSize(sessionType);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: query,
        tools: [
          {
            type: "web_search" as const,
            search_context_size: contextSize,
          },
        ],
        max_output_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      console.warn("[analyst] web search API error", { status, queryLen: query.length });
      return {
        used: false,
        summary: "",
        sources: [],
        error: `Search API returned HTTP ${status}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const sources = extractSources(data);
    const summary = extractSearchSummary(data);

    console.log("[analyst] web search completed", {
      sourceCount: sources.length,
      summaryLen: summary.length,
      contextSize,
    });

    return {
      used: sources.length > 0 || summary.length > 0,
      summary: summary || "No relevant current information was found.",
      sources,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn("[analyst] web search exception", message);
    return {
      used: false,
      summary: "",
      sources: [],
      error: message,
    };
  }
}

/**
 * Format external research into a labeled context block for the system prompt.
 */
function formatExternalResearchContext(result: ExternalResearchResult): string {
  if (!result.used) return "";

  const parts: string[] = [];

  parts.push("CURRENT EXTERNAL RESEARCH — WEB SOURCES");
  parts.push(
    "The following information was retrieved from current web sources. " +
    "It may contain errors, conflicting reports, or outdated information. " +
    "Cross-reference with Personal Open Intelligence where applicable.",
  );

  if (result.summary) {
    parts.push(result.summary);
  }

  if (result.sources.length > 0) {
    const sourceList = result.sources
      .slice(0, 10)
      .map((s, i) => `${i + 1}. ${s.title} — ${s.url}`)
      .join("\n");
    parts.push(`\nSOURCES (${result.sources.length}):\n${sourceList}`);
  }

  return parts.join("\n\n");
}

// ── Prompt Building ──────────────────────────────────────────────────────────

function getSessionInstruction(sessionType: SessionType): string {
  switch (sessionType) {
    case "oracle":
      return "Deliver a deep tactical read with emotionally aware risk framing. Explore multiple scenarios, address counterarguments, and quantify uncertainty where appropriate. Keep it concise yet premium.";
    case "quick-analytics":
      return "Deliver a short tactical analytics read with clear confidence language. Compare against available Personal Open Intelligence and current research where relevant.";
    case "quick-check":
      return "Deliver a fast, direct signal check in three sentences or fewer. No preamble. No filler. Surface the highest-confidence read.";
    case "premium-event":
      return "Deliver an event-focused intelligence breakdown. Analyze timing, matchups, narratives, and critical moments. Prioritize current information from external research.";
    default:
      return "Deliver a balanced EAGOH analyst response with tactical intelligence, emotional awareness, and confidence caveats. When Personal Open Intelligence or current external research is provided, integrate it thoughtfully without treating any single source as verified fact.";
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
 *
 * Section order:
 *   1. Core system identity & safety
 *   2. Session depth & response format
 *   3. EAGOH identity and domain
 *   4. Source handling instructions (OI + external research)
 */
function buildSystemPrompt(params: {
  sessionType: SessionType;
  personality: string;
  kind: string;
  eagohMeta?: { name: string; domain: string } | null;
  hasOI: boolean;
  hasExternalResearch: boolean;
}): string {
  const sections: string[] = [];

  // 1. Core system identity
  sections.push(
    "You are the EAGOH Analyst: intelligent, emotionally aware, tactical, premium, and futuristic.",
    "Do not claim certainty. Do not mention internal implementation, tools, or knowledge cutoff dates.",
  );

  if (params.hasExternalResearch) {
    sections.push(
      "You have access to current external web research (provided below). Use it to ground your analysis in up-to-date information. Cite sources where appropriate. When external research conflicts with Personal Open Intelligence, identify the conflict explicitly rather than silently choosing one side.",
    );
  } else {
    sections.push(
      "Do not fabricate web search results, URLs, citations, or pretend to have searched the internet.",
      "Only use the Personal Open Intelligence provided below (when present) alongside your trained knowledge.",
    );
  }

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
  if (params.hasOI && params.hasExternalResearch) {
    sections.push(
      "SOURCE HANDLING (Dual Sources):",
      "- Personal Open Intelligence is private user-provided knowledge — potentially valuable but not automatically verified.",
      "- Current External Research comes from web sources — it may also contain errors or conflicting reports.",
      "- When the two conflict: 'Your Personal Intelligence suggests X, while current external research indicates Y.'",
      "- Explain which information is newer, which is better supported, and whether the discrepancy could be context-dependent.",
      "- Never silently discard the user's observations. Preserve them as a perspective.",
      "- Never automatically treat external research as correct either — weigh recency, source quality, and agreement.",
    );
  } else if (params.hasOI) {
    sections.push(
      "SOURCE HANDLING:",
      "- Personal Open Intelligence is provided below. Treat it as private user knowledge — potentially valuable but not automatically verified.",
      "- Conflicting signals between your trained knowledge and the user's Personal Open Intelligence should be surfaced explicitly: 'Your Personal Intelligence suggests X, while general knowledge indicates Y.'",
      "- Never silently discard the user's observations. Preserve them as a perspective.",
    );
  } else if (params.hasExternalResearch) {
    sections.push(
      "SOURCE HANDLING:",
      "- Current external web research is provided below. Ground your analysis in these real sources.",
      "- Cite sources where appropriate. Do not fabricate additional URLs or citations.",
      "- External research may contain errors — acknowledge uncertainty when sources conflict.",
    );
  } else {
    sections.push(
      "SOURCE HANDLING:",
      "- No personal intelligence or current research was found for this query. Base your response on trained knowledge and conversation context.",
      "- Do not claim or imply that external research or personal intelligence was used.",
    );
  }

  return sections.join("\n\n");
}

/**
 * Build the messages array for OpenAI with all sections properly ordered:
 *
 *   1. System prompt (identity + session + EAGOH + source handling)
 *   2. Personal Open Intelligence (if present)
 *   3. Current External Research (if present)
 *   4. Conversation history
 *   5. Current user question
 */
function buildMessages(params: {
  systemPrompt: string;
  oiContext: string;
  externalResearchContext: string;
  conversationContext: ConversationMessage[];
  prompt: string;
}): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const systemParts = [params.systemPrompt];

  if (params.oiContext) {
    systemParts.push(params.oiContext);
  }

  if (params.externalResearchContext) {
    systemParts.push(params.externalResearchContext);
  }

  const systemContent = systemParts.join("\n\n---\n\n");

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemContent },
  ];

  if (params.conversationContext.length > 0) {
    const recent = params.conversationContext.slice(-20);
    for (const msg of recent) {
      messages.push({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      });
    }
  }

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

  // ── EAGOH ownership verification & Personal OI retrieval ──────────────────
  let eagohMeta: { name: string; domain: string } | null = null;
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

    const rawEntries = await retrievePersonalOpenIntelligence(supabase, userId, payload.eagohId, 50);
    const limit = sessionOILimit(sessionType);
    const tokenBudget = sessionOITokenBudget(sessionType);

    if (rawEntries.length > 0) {
      const ranked = rankEntries(rawEntries, prompt, Math.min(limit, rawEntries.length));
      const formatted = formatOIContext(ranked, tokenBudget);
      oiContext = formatted.text;
      oiCount = formatted.count;

      console.log("[analyst] OI retrieval", {
        totalEntries: rawEntries.length,
        rankedCount: ranked.length,
        selectedCount: oiCount,
        sessionType,
      });
    } else {
      console.log("[analyst] OI retrieval: no entries found for this EAGOH");
    }
  } else {
    console.log("[analyst] virtual Quick Check — skipping personal OI retrieval");
  }

  // ── External web search ──────────────────────────────────────────────────
  let externalResearchResult: ExternalResearchResult = {
    used: false,
    summary: "",
    sources: [],
  };

  const searchWanted = shouldUseExternalSearch(prompt, sessionType);

  if (searchWanted) {
    console.log("[analyst] external search triggered", { sessionType });

    const searchQuery = buildSearchQuery(prompt, eagohMeta?.domain);
    externalResearchResult = await performWebSearch(searchQuery, env.OPENAI_API_KEY, sessionType);

    console.log("[analyst] external search result", {
      used: externalResearchResult.used,
      sourceCount: externalResearchResult.sources.length,
      summaryLen: externalResearchResult.summary.length,
      error: externalResearchResult.error ?? "none",
    });
  } else {
    console.log("[analyst] external search skipped — no freshness triggers detected");
  }

  const externalResearchContext = formatExternalResearchContext(externalResearchResult);

  // ── Build prompt ─────────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt({
    sessionType,
    personality,
    kind,
    eagohMeta,
    hasOI: oiCount > 0,
    hasExternalResearch: externalResearchResult.used,
  });

  const messages = buildMessages({
    systemPrompt,
    oiContext,
    externalResearchContext,
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

      const confidenceMap: Record<SessionType, number> = {
        "quick-check": 82,
        "quick-analytics": 86,
        standard: 89,
        oracle: 93,
        "premium-event": 90,
      };

      const grounding: PersonalGrounding = {
        personalOpenIntelligenceUsed: oiCount > 0,
        personalOpenIntelligenceCount: oiCount,
        externalSearchUsed: externalResearchResult.used,
        sourceCount: externalResearchResult.sources.length,
      };

      console.log("[analyst] success", {
        replyLen: reply.length,
        personalOIUsed: grounding.personalOpenIntelligenceUsed,
        personalOICount: grounding.personalOpenIntelligenceCount,
        externalSearchUsed: grounding.externalSearchUsed,
        sourceCount: grounding.sourceCount,
        hasEagoh: !!payload.eagohId,
      });

      return jsonResponse({
        ok: true,
        reply,
        model: "gpt-4o-mini",
        sessionType,
        confidence: confidenceMap[sessionType],
        grounding,
        sources: externalResearchResult.sources,
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
