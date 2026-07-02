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
 * Phase 2 — Real external web search via Responses API:
 *   1. Determines whether current research is needed
 *   2. Calls OpenAI Responses API (POST /v1/responses) with web_search tool
 *   3. Extracts source annotations from official API response
 *   4. Includes research summary in the final prompt
 *   5. Labels sources clearly and handles OI/external conflicts
 *
 * Phase 3A — Faction Intelligence (deployed)
 *   1. Checks subscription tier (free users skip faction retrieval)
 *   2. Retrieves active faction memberships for the authenticated user
 *   3. Loads explicitly shared OI entries from faction_shared_intelligence
 *   4. Verifies ownership, resolves entries, excludes the user's own
 *   5. Ranks and formats faction entries separately from personal OI
 *   6. Labels faction intelligence clearly in the final prompt
 *
 * Phase 4A — Exchange Sync Intelligence (deployed):
 *   1. Retrieves active Exchange sync purchases for the authenticated user
 *   2. Resolves vendor EAGOHs and loads exchange_share_enabled OI entries
 *   3. Builds a stable access cohort and applies sync percentage
 *   4. Ranks the accessible cohort and applies session entry limits
 *   5. Formats and labels Exchange Intelligence separately
 *
 * Search model: gpt-4o (supports web_search tool natively)
 * Exchange retrieval: uses service_role Supabase client for cross-user OI access
 * Final answer: gpt-4o-mini via Chat Completions API
 *
 * No API keys, private OI content, or service-role tokens ever reach the client.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Environment ───────────────────────────────────────────────────────────────

type Env = {
  OPENAI_API_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
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
  threadId?: string | null;
  messageId?: string | null;
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
  factionIntelligenceUsed: boolean;
  factionIntelligenceCount: number;
  exchangeIntelligenceUsed: boolean;
  exchangeIntelligenceCount: number;
  externalSearchUsed: boolean;
  sourceCount: number;
  exchangeAccess?: {
    activeSyncCount: number;
    vendorEagohCount: number;
  };
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

type FactionMemberRow = {
  id: string;
  faction_id: string;
  user_id: string;
  role: string;
  status: string;
};

type FactionSharedIntelRow = {
  id: string;
  faction_id: string;
  user_id: string;
  oi_entry_id: string;
  shared_at: string;
};

type FactionRow = {
  id: string;
  name: string;
};

type ExchangeSyncRecord = {
  purchaseId: string;
  listingId: string;
  vendorId: string;
  vendorEagohId: string;
  syncPercentage: number;
  startsAt: string;
  expiresAt: string;
  vendorEagohName?: string;
};

type ExchangeResearchResult = {
  used: boolean;
  entries: OpenIntelligenceRow[];
  syncCount: number;
  vendorEagohCount: number;
  /** Map from entry ID to its exchange purchase ID for audit tracking */
  entryPurchaseMap: Map<string, { purchaseId: string; syncPercentage: number }>;
};

/** Faction OI entry with contributor and faction tracking for audit. */
type FactionOIEntry = OpenIntelligenceRow & {
  faction_id: string;
  contributor_user_id: string;
};

/** Unified audit entry record for batch insert. */
type AuditEntryRecord = {
  execution_id: string;
  requesting_user_id: string;
  source_type: "personal" | "faction" | "exchange" | "external_research";
  source_entry_id: string | null;
  source_owner_id: string | null;
  source_eagoh_id: string | null;
  faction_id: string | null;
  exchange_purchase_id: string | null;
  relevance_score: number | null;
  source_rank: number | null;
  sync_percentage: number | null;
  source_created_at: string | null;
  source_category: string | null;
  source_validation_status: string | null;
  source_quality_score: number | null;
  source_confidence_level: string | null;
  external_url_hash: string | null;
  external_publisher: string | null;
  session_type: string;
  selected_eagoh_id: string | null;
  analyst_thread_id: string | null;
  analyst_message_id: string | null;
};

// ── Service-role Supabase client ─────────────────────────────────────────────

/**
 * Create a Supabase client using the service_role key for server-only
 * operations that need to bypass RLS (Exchange intelligence retrieval).
 */
function getServiceRoleClient(env: Env): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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

// ── Subscription Check ───────────────────────────────────────────────────────

/**
 * Check whether the authenticated user has a paid subscription.
 * Queries profiles.subscription_tier — free users skip faction intelligence.
 */
async function isPaidUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    console.warn("[analyst] subscription check failed", error?.message);
    return false;
  }

  const tier = (data as { subscription_tier: string }).subscription_tier;
  return tier && tier !== "free";
}

// ── Faction Membership Retrieval ─────────────────────────────────────────────

/**
 * Get eligible faction memberships for the authenticated user.
 * Only active (or grace-period) memberships are returned.
 * Free users are filtered out by `isPaidUser` before calling this.
 */
async function getEligibleFactionMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ factionId: string; factionName: string }[]> {
  const { data, error } = await supabase
    .from("faction_members")
    .select("faction_id, status")
    .eq("user_id", userId)
    .in("status", ["active", "grace_period"]);

  if (error || !data || data.length === 0) {
    if (error) console.warn("[analyst] faction membership query failed", error.message);
    return [];
  }

  const factionIds = [...new Set((data as Array<{ faction_id: string }>).map((r) => r.faction_id))];
  if (factionIds.length === 0) return [];

  // Resolve faction names
  const { data: factions } = await supabase
    .from("factions")
    .select("id, name")
    .in("id", factionIds);

  const nameMap = new Map<string, string>();
  for (const f of (factions ?? []) as FactionRow[]) {
    nameMap.set(f.id, f.name);
  }

  return factionIds.map((id) => ({
    factionId: id,
    factionName: nameMap.get(id) ?? "Unknown Faction",
  }));
}

// ── Faction Open Intelligence Retrieval ──────────────────────────────────────

/**
 * Retrieve Open Intelligence entries explicitly shared with the user's factions.
 *
 * Flow:
 *   1. Get eligible faction memberships
 *   2. Load faction_shared_intelligence for those factions
 *   3. Resolve referenced OI entries (exclude the user's own — those are personal)
 *   4. Rank and return the most relevant entries
 */
async function retrieveFactionOpenIntelligence(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  sessionType: SessionType,
): Promise<{ entries: FactionOIEntry[]; allRanked: FactionOIEntry[] }> {
  const emptyResult = { entries: [] as FactionOIEntry[], allRanked: [] as FactionOIEntry[] };
  const memberships = await getEligibleFactionMemberships(supabase, userId);
  if (memberships.length === 0) return emptyResult;

  const factionIds = memberships.map((m) => m.factionId);

  const { data: sharedRows, error: sharedErr } = await supabase
    .from("faction_shared_intelligence")
    .select("oi_entry_id, user_id, faction_id")
    .in("faction_id", factionIds)
    .order("shared_at", { ascending: false })
    .limit(100);

  if (sharedErr || !sharedRows || sharedRows.length === 0) {
    if (sharedErr) console.warn("[analyst] faction shared intel query failed", sharedErr.message);
    return emptyResult;
  }

  const typed = sharedRows as Array<{ oi_entry_id: string; user_id: string; faction_id: string }>;
  const foreignRows = typed.filter((r) => r.user_id !== userId);
  if (foreignRows.length === 0) return emptyResult;

  const factionMap = new Map<string, { faction_id: string; contributor_user_id: string }>();
  for (const r of foreignRows) {
    if (!factionMap.has(r.oi_entry_id)) {
      factionMap.set(r.oi_entry_id, { faction_id: r.faction_id, contributor_user_id: r.user_id });
    }
  }

  const entryIds = [...new Set(foreignRows.map((r) => r.oi_entry_id))];

  const { data: entries, error: entriesErr } = await supabase
    .from("open_intelligence")
    .select("*")
    .in("id", entryIds)
    .in("validation_status", ["pending_review", "validated"]);

  if (entriesErr || !entries || entries.length === 0) {
    if (entriesErr) console.warn("[analyst] faction OI entry fetch failed", entriesErr.message);
    return emptyResult;
  }

  const rawEntries = entries as OpenIntelligenceRow[];

  const factionEntries: FactionOIEntry[] = rawEntries.map((e) => {
    const meta = factionMap.get(e.id);
    return { ...e, faction_id: meta?.faction_id ?? "", contributor_user_id: meta?.contributor_user_id ?? "" };
  });

  const limit = sessionFactionOILimit(sessionType);
  const ranked = rankEntries(factionEntries, query, Math.min(limit, factionEntries.length));
  return { entries: ranked, allRanked: factionEntries };
}

// ── Session Faction Entry Limits ─────────────────────────────────────────────

function sessionFactionOILimit(sessionType: SessionType): number {
  switch (sessionType) {
    case "quick-check": return 2;
    case "quick-analytics": return 4;
    case "standard": return 7;
    case "oracle": return 12;
    case "premium-event": return 8;
  }
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

// ── Exchange Intelligence ─────────────────────────────────────────────────────

/**
 * Session-specific limits for Exchange intelligence entries.
 */
function sessionExchangeOILimit(sessionType: SessionType): number {
  switch (sessionType) {
    case "quick-check": return 2;
    case "quick-analytics": return 4;
    case "standard": return 8;
    case "oracle": return 14;
    case "premium-event": return 10;
  }
}

/**
 * Get all active Exchange syncs for the authenticated buyer.
 *
 * Validates server-side:
 *   - buyer_id matches authenticated user
 *   - purchase is active
 *   - started_at is in the past
 *   - expires_at is in the future
 *   - sync_level is a valid percentage (25, 50, 75, 100)
 *   - listing still references the same vendor EAGOH
 *   - vendor EAGOH still exists and is not deleted
 *
 * Uses the service_role client to avoid RLS issues when verifying vendor EAGOHs.
 */
async function getActiveExchangeSyncs(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<ExchangeSyncRecord[]> {
  const now = new Date().toISOString();

  const { data, error } = await serviceClient
    .from("marketplace_sync_purchases")
    .select("id, listing_id, vendor_id, eagoh_id, sync_level, started_at, expires_at")
    .eq("buyer_id", userId)
    .eq("active", true)
    .lte("started_at", now)
    .gt("expires_at", now);

  if (error || !data || data.length === 0) {
    if (error) console.warn("[analyst] exchange syncs query failed", error.message);
    return [];
  }

  const validSyncs: ExchangeSyncRecord[] = [];

  for (const row of data as Array<{
    id: string;
    listing_id: string;
    vendor_id: string;
    eagoh_id: string;
    sync_level: string;
    started_at: string;
    expires_at: string;
  }>) {
    // Validate sync percentage
    const pct = parseInt(row.sync_level.replace("%", ""), 10);
    if (![25, 50, 75, 100].includes(pct)) continue;

    // Verify vendor EAGOH still exists
    const { data: eagoh } = await serviceClient
      .from("eagohs")
      .select("id, name")
      .eq("id", row.eagoh_id)
      .maybeSingle();
    if (!eagoh) continue;

    validSyncs.push({
      purchaseId: row.id,
      listingId: row.listing_id,
      vendorId: row.vendor_id,
      vendorEagohId: row.eagoh_id,
      syncPercentage: pct,
      startsAt: row.started_at,
      expiresAt: row.expires_at,
      vendorEagohName: (eagoh as { name?: string }).name ?? undefined,
    });
  }

  return validSyncs;
}

/**
 * Compute a stable vendor-entry access ordering independent of the current question.
 *
 * Ordering factors (descending):
 *   - quality_score
 *   - validated entries first
 *   - influence_score
 *   - stable entry ID tie-breaker
 */
function stableCohortOrder(entries: OpenIntelligenceRow[]): OpenIntelligenceRow[] {
  return [...entries].sort((a, b) => {
    // Quality first
    if (b.quality_score !== a.quality_score) return b.quality_score - a.quality_score;
    // Validated entries come first
    const aIsValidated = a.validation_status === "validated" ? 1 : 0;
    const bIsValidated = b.validation_status === "validated" ? 1 : 0;
    if (aIsValidated !== bIsValidated) return bIsValidated - aIsValidated;
    // Influence
    if (b.influence_score !== a.influence_score) return b.influence_score - a.influence_score;
    // Confidence
    const confOrder: Record<string, number> = {
      verified_observation: 3, strong_confidence: 2,
      moderate_confidence: 1, weak_suspicion: 0,
    };
    const aConf = confOrder[a.confidence_level] ?? 0;
    const bConf = confOrder[b.confidence_level] ?? 0;
    if (aConf !== bConf) return bConf - aConf;
    // Stable tie-breaker
    return a.id.localeCompare(b.id);
  });
}

/**
 * Retrieve Exchange Open Intelligence for the authenticated buyer.
 *
 * Flow:
 *   1. Load active Exchange syncs
 *   2. For each vendor EAGOH, load eligible OI entries (exchange_share_enabled)
 *   3. Deduplicate by entry ID (a single entry could appear across syncs)
 *   4. Build a stable access cohort (independent of query)
 *   5. Apply purchased percentage to determine accessible cohort
 *   6. Rank the accessible cohort against the current question
 *   7. Apply session limits
 */
async function retrieveExchangeOpenIntelligence(
  serviceClient: SupabaseClient,
  userId: string,
  query: string,
  sessionType: SessionType,
): Promise<ExchangeResearchResult> {
  const syncs = await getActiveExchangeSyncs(serviceClient, userId);

  if (syncs.length === 0) {
    return { used: false, entries: [], syncCount: 0, vendorEagohCount: 0, entryPurchaseMap: new Map() };
  }

  // Collect unique vendor EAGOH IDs
  const vendorEagohIds = [...new Set(syncs.map((s) => s.vendorEagohId))];
  const vendorIds = [...new Set(syncs.map((s) => s.vendorId))];

  // Build percentage map per vendor EAGOH (use highest percentage if multiple purchases)
  const pctMap = new Map<string, number>();
  for (const s of syncs) {
    const existing = pctMap.get(s.vendorEagohId) ?? 0;
    pctMap.set(s.vendorEagohId, Math.max(existing, s.syncPercentage));
  }

  // Load eligible OI entries from each vendor EAGOH
  const eligibleMap = new Map<string, OpenIntelligenceRow[]>();

  for (const eagohId of vendorEagohIds) {
    const { data, error } = await serviceClient
      .from("open_intelligence")
      .select("*")
      .eq("eagoh_id", eagohId)
      .eq("exchange_share_enabled", true)
      .in("validation_status", ["pending_review", "validated"])
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.warn("[analyst] exchange OI fetch failed for eagoh", { eagohId, error: error.message });
      continue;
    }

    if (data && data.length > 0) {
      eligibleMap.set(eagohId, data as OpenIntelligenceRow[]);
    }
  }

  // Deduplicate across EAGOHs (same entry shouldn't appear twice)
  const seenIds = new Set<string>();
  const allEligible: OpenIntelligenceRow[] = [];
  for (const entries of eligibleMap.values()) {
    for (const entry of entries) {
      if (!seenIds.has(entry.id)) {
        seenIds.add(entry.id);
        allEligible.push(entry);
      }
    }
  }

  if (allEligible.length === 0) {
    return { used: false, entries: [], syncCount: syncs.length, vendorEagohCount: vendorEagohIds.length, entryPurchaseMap: new Map() };
  }

  // Apply stable cohort + percentage for each vendor EAGOH
  const accessible: OpenIntelligenceRow[] = [];

  for (const [eagohId, entries] of eligibleMap) {
    const pct = pctMap.get(eagohId) ?? 0;
    if (pct === 0 || entries.length === 0) continue;

    const ordered = stableCohortOrder(entries);
    const accessibleCount = Math.ceil(ordered.length * pct / 100);
    const cohort = ordered.slice(0, accessibleCount);

    for (const entry of cohort) {
      accessible.push(entry);
    }
  }

  // Rank accessible entries against current question
  const limit = sessionExchangeOILimit(sessionType);
  const ranked = accessible.length > 0
    ? rankEntries(accessible, query, Math.min(limit, accessible.length))
    : [];

  console.log("[analyst] Exchange OI retrieval", {
    syncCount: syncs.length,
    vendorEagohCount: vendorEagohIds.length,
    eligibleTotal: allEligible.length,
    accessibleAfterPct: accessible.length,
    selectedAfterRank: ranked.length,
    sessionType,
  });

  // Build purchase tracking map for audit
  const entryPurchaseMap = new Map<string, { purchaseId: string; syncPercentage: number }>();
  for (const [eagohId, entries] of eligibleMap) {
    const pct = pctMap.get(eagohId) ?? 0;
    const matchingSync = syncs.find((s) => s.vendorEagohId === eagohId);
    if (matchingSync && pct > 0) {
      for (const entry of entries) {
        if (!entryPurchaseMap.has(entry.id)) {
          entryPurchaseMap.set(entry.id, {
            purchaseId: matchingSync.purchaseId,
            syncPercentage: pct,
          });
        }
      }
    }
  }

  return {
    used: ranked.length > 0,
    entries: ranked,
    syncCount: syncs.length,
    vendorEagohCount: vendorEagohIds.length,
    entryPurchaseMap,
  };
}

// ── Exchange OI Formatting ───────────────────────────────────────────────────

/**
 * Format Exchange-licensed Open Intelligence entries into a clearly labeled
 * context block, separate from Personal, Faction, and External sources.
 */
function formatExchangeOIContext(
  result: ExchangeResearchResult,
  tokenBudget: number,
): { text: string; count: number } {
  if (result.entries.length === 0) return { text: "", count: 0 };

  const blocks = result.entries.map((entry, i) => {
    const confidenceLabel = entry.confidence_level.replace(/_/g, " ");
    const quality = entry.quality_score;
    const date = new Date(entry.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const maxContentChars = Math.max(80, Math.floor(tokenBudget / result.entries.length / 4) * 4);
    const content = entry.content.length > maxContentChars
      ? entry.content.slice(0, maxContentChars) + "..."
      : entry.content;

    const tagLine = [
      entry.selected_category,
      ...(entry.selected_subtags ?? []),
      ...(entry.custom_tags ?? []),
    ].filter(Boolean).join(", ") || entry.tag;

    return `[Exchange Entry ${i + 1}]
Category: ${entry.selected_category ?? "General"}
Tags: ${tagLine}
Confidence: ${confidenceLabel}
Quality: ${quality}/100
Created: ${date}
Content: ${content}`;
  });

  const text = `EXCHANGE INTELLIGENCE — LICENSED HUMAN KNOWLEDGE (${result.entries.length} entries)
Exchange Intelligence contains human-provided knowledge temporarily licensed through an active synchronization purchase. Treat it as valuable experience, not automatically verified fact. Do not imply ownership by the buyer.

Active synchronizations: ${result.syncCount}. Vendor EAGOHs: ${result.vendorEagohCount}.

${blocks.join("\n\n")}`;

  return { text, count: result.entries.length };
}

// ── Faction OI Formatting ────────────────────────────────────────────────────

/**
 * Format faction-shared Open Intelligence entries into a clearly labeled
 * context block, separate from Personal Open Intelligence.
 */
function formatFactionOIContext(
  entries: OpenIntelligenceRow[],
  tokenBudget: number,
): { text: string; count: number } {
  if (entries.length === 0) return { text: "", count: 0 };

  const blocks = entries.map((entry, i) => {
    const confidenceLabel = entry.confidence_level.replace(/_/g, " ");
    const quality = entry.quality_score;
    const date = new Date(entry.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    const maxContentChars = Math.max(80, Math.floor(tokenBudget / entries.length / 4) * 4);
    const content = entry.content.length > maxContentChars
      ? entry.content.slice(0, maxContentChars) + "..."
      : entry.content;

    const tagLine = [entry.selected_category, ...(entry.selected_subtags ?? []), ...(entry.custom_tags ?? [])]
      .filter(Boolean)
      .join(", ") || entry.tag;

    return `[Faction Entry ${i + 1}]
Category: ${entry.selected_category ?? "General"}
Tags: ${tagLine}
Confidence: ${confidenceLabel}
Quality: ${quality}/100
Created: ${date}
Content: ${content}`;
  });

  const text = `FACTION INTELLIGENCE — SHARED HUMAN KNOWLEDGE (${entries.length} entries)
Faction Intelligence contains human-provided knowledge deliberately shared with authorized Faction members. Treat it as valuable experience, but not automatically verified fact. Compare it with Personal Open Intelligence and Current External Research.

${blocks.join("\n\n")}`;

  return { text, count: entries.length };
}

// ── External Web Search ──────────────────────────────────────────────────────

/** The model used for the OpenAI Responses API web-search call.
 *  gpt-4o supports the `web_search` tool natively. */
const SEARCH_MODEL = "gpt-4o" as const;

/** Determines whether external web search is needed based on the prompt
 *  and session type. Uses a deterministic keyword heuristic.
 *
 *  Premium Event sessions always enable search.
 *  Freshness-related keywords (current, latest, today, scores, etc.)
 *  trigger search for other session types. */
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
 * Parses `url_citation` annotations from message output_text blocks.
 * These are the official source annotations returned by the web_search tool.
 *
 * Also attempts to pull URLs from `web_search_call` result items when present,
 * though the primary source of title+URL pairs is url_citation annotations.
 *
 * Deduplicates by normalized URL and rejects malformed/non-HTTP URLs.
 */
function extractSources(data: Record<string, unknown>): Source[] {
  const sources: Source[] = [];
  const seenUrls = new Set<string>();

  const output = data.output as Array<Record<string, unknown>> | undefined;
  if (!output || !Array.isArray(output)) return sources;

  for (const item of output) {
    // web_search_call: may contain result URLs in various sub-structures
    if (item.type === "web_search_call") {
      // Try web_search_call.results (newer API format)
      const wsResults = (item as Record<string, unknown>).web_search_call as Record<string, unknown> | undefined;
      const results = wsResults?.results as Array<{ url?: string; title?: string }> | undefined;
      if (results) {
        for (const r of results) {
          const normalizedUrl = (r.url ?? "").trim().replace(/\/$/, "");
          if (normalizedUrl && isValidHttpUrl(normalizedUrl) && !seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl);
            sources.push({ title: r.title || extractTitleFromUrl(normalizedUrl), url: normalizedUrl });
          }
        }
      }

      // Also try legacy action.sources for backward compatibility
      const action = (item as Record<string, unknown>).action as Record<string, unknown> | undefined;
      const srcs = action?.sources as Array<{ type?: string; url?: string }> | undefined;
      if (srcs) {
        for (const src of srcs) {
          const normalizedUrl = (src.url ?? "").trim().replace(/\/$/, "");
          if (src.type === "url" && normalizedUrl && isValidHttpUrl(normalizedUrl) && !seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl);
            sources.push({ title: extractTitleFromUrl(normalizedUrl), url: normalizedUrl });
          }
        }
      }
    }

    // message: may contain url_citation annotations with proper titles
    if (item.type === "message") {
      const content = (item as Record<string, unknown>).content as Array<Record<string, unknown>> | undefined;
      if (content) {
        for (const block of content) {
          if (block.type === "output_text") {
            const annotations = (block as Record<string, unknown>).annotations as Array<Record<string, unknown>> | undefined;
            if (annotations) {
              for (const ann of annotations) {
                if (ann.type === "url_citation") {
                  const annRecord = ann as Record<string, unknown>;
                  const url = (annRecord.url as string) ?? "";
                  const normalizedUrl = url.trim().replace(/\/$/, "");
                  if (normalizedUrl && isValidHttpUrl(normalizedUrl) && !seenUrls.has(normalizedUrl)) {
                    seenUrls.add(normalizedUrl);
                    sources.push({
                      title: (annRecord.title as string) || extractTitleFromUrl(normalizedUrl),
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

  return sources;
}

/** Validate a URL string is a proper HTTP/HTTPS URL. */
function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
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
 * Perform real web search via OpenAI Responses API with `web_search` tool.
 *
 * Uses `gpt-4o` (which supports the web_search tool natively) with the
 * official Responses endpoint. Returns only source annotations produced by
 * the actual tool execution — never fabricates URLs, titles, or publishers.
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
        model: SEARCH_MODEL,
        input: query,
        tools: [
          {
            type: "web_search" as const,
            user_location: { type: "approximate" as const },
            search_context_size: contextSize,
          },
        ],
        max_output_tokens: 2500,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      let errorDetail = "";
      try {
        const errBody = await response.text();
        errorDetail = errBody.slice(0, 300);
      } catch { /* ignore */ }
      console.warn("[analyst] web search API error", { status, queryLen: query.length, detail: errorDetail });
      return {
        used: false,
        summary: "",
        sources: [],
        error: `Search API returned HTTP ${status}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Verify the web_search tool was actually executed by the API
    const output = data.output as Array<Record<string, unknown>> | undefined;
    const hasWebSearchCall = output?.some((item) => item.type === "web_search_call");

    if (!hasWebSearchCall) {
      console.warn("[analyst] web search tool was NOT executed — model may not support web_search", {
        model: SEARCH_MODEL,
        outputTypes: output?.map((i) => i.type).join(", ") ?? "none",
      });
    }

    const sources = extractSources(data);
    const summary = extractSearchSummary(data);

    console.log("[analyst] web search completed", {
      sourceCount: sources.length,
      summaryLen: summary.length,
      contextSize,
      toolExecuted: hasWebSearchCall,
    });

    return {
      used: hasWebSearchCall && (sources.length > 0 || summary.length > 0),
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

// ── Audit Utilities ──────────────────────────────────────────────────────────

/** Simple hash for external URLs to avoid storing full URLs in audit. */
function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return "url_" + Math.abs(hash).toString(16).slice(0, 12);
}

/** Normalize a domain from a URL for external publisher tracking. */
function extractPublisher(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

// ── Phase 5A: Comprehensive Audit Recording ───────────────────────────────────

/**
 * Write complete audit records for all source types used in an analyst response.
 *
 * Writes ONE analyst_response_audits summary row and batch-inserts all
 * analyst_context_usage detail rows. Uses the service_role client.
 * Best-effort — never fails the analyst session.
 *
 * If individual source rows fail but the summary succeeds, audit_status = 'partial'.
 */
async function writeAuditRecords(
  serviceClient: SupabaseClient,
  params: {
    executionId: string;
    userId: string;
    sessionType: string;
    selectedEagohId: string | null;
    threadId: string | null;
    messageId: string | null;
    model: string;
    confidence: number;
    auditEntries: AuditEntryRecord[];
    externalSearchUsed: boolean;
  },
): Promise<void> {
  try {
    const personalCount = params.auditEntries.filter((e) => e.source_type === "personal").length;
    const factionCount = params.auditEntries.filter((e) => e.source_type === "faction").length;
    const exchangeCount = params.auditEntries.filter((e) => e.source_type === "exchange").length;
    const externalCount = params.auditEntries.filter((e) => e.source_type === "external_research").length;

    // 1. Write the response-level audit summary
    const { error: summaryErr } = await serviceClient
      .from("analyst_response_audits")
      .insert({
        execution_id: params.executionId,
        requesting_user_id: params.userId,
        analyst_thread_id: params.threadId ?? null,
        analyst_message_id: params.messageId ?? null,
        session_type: params.sessionType,
        selected_eagoh_id: params.selectedEagohId ?? null,
        personal_count: personalCount,
        faction_count: factionCount,
        exchange_count: exchangeCount,
        external_source_count: externalCount,
        external_search_used: params.externalSearchUsed,
        model: params.model,
        confidence: params.confidence,
        audit_status: "complete",
      });

    if (summaryErr) {
      console.warn("[analyst] audit summary insert failed", summaryErr.message);
      return;
    }

    // 2. Batch-insert all context usage detail rows
    if (params.auditEntries.length > 0) {
      const rows = params.auditEntries.map((e) => ({
        execution_id: params.executionId,
        requesting_user_id: params.userId,
        analyst_thread_id: params.threadId ?? null,
        analyst_message_id: params.messageId ?? null,
        session_type: params.sessionType,
        selected_eagoh_id: params.selectedEagohId ?? null,
        source_type: e.source_type,
        source_entry_id: e.source_entry_id,
        source_owner_id: e.source_owner_id,
        source_eagoh_id: e.source_eagoh_id,
        faction_id: e.faction_id,
        exchange_purchase_id: e.exchange_purchase_id,
        relevance_score: e.relevance_score,
        source_rank: e.source_rank,
        sync_percentage: e.sync_percentage,
        source_created_at: e.source_created_at,
        source_category: e.source_category,
        source_validation_status: e.source_validation_status,
        source_quality_score: e.source_quality_score,
        source_confidence_level: e.source_confidence_level,
        external_url_hash: e.external_url_hash,
        external_publisher: e.external_publisher,
        used_at: new Date().toISOString(),
      }));

      const { error: detailErr } = await serviceClient
        .from("analyst_context_usage")
        .insert(rows);

      if (detailErr) {
        console.warn("[analyst] audit detail batch insert failed", detailErr.message);
        await serviceClient
          .from("analyst_response_audits")
          .update({ audit_status: "partial" })
          .eq("execution_id", params.executionId);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.warn("[analyst] audit write exception", msg);
    // Don't fail the session — audit is best-effort
  }
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
  hasFactionOI: boolean;
  hasExchangeOI: boolean;
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

  // 4. Source handling instructions — covers all combinations of OI, Faction, Exchange, and External
  const sourceCount = [params.hasOI, params.hasFactionOI, params.hasExchangeOI, params.hasExternalResearch].filter(Boolean).length;

  if (sourceCount >= 2) {
    // Multi-source: provide comprehensive conflict-resolution instructions
    const lines: string[] = ["SOURCE HANDLING (Multiple Intelligence Sources):"];
    if (params.hasOI) lines.push("- Personal Open Intelligence is private user-provided knowledge — potentially valuable but not automatically verified.");
    if (params.hasFactionOI) lines.push("- Faction Intelligence is human-provided knowledge shared by authorized faction members — valuable experience but not automatically verified.");
    if (params.hasExchangeOI) lines.push("- Exchange Intelligence is licensed human knowledge temporarily accessed through Exchange synchronization — valuable but not automatically verified.");
    if (params.hasExternalResearch) lines.push("- Current External Research comes from web sources — it may also contain errors or conflicting reports.");
    lines.push(
      "- When sources conflict, identify the conflict explicitly rather than silently choosing one.",
      "- Use phrasing like: 'Your Personal Intelligence suggests X, Faction Intelligence indicates Y, licensed Exchange Intelligence suggests Z, and current external research reports W.'",
      "- Explain which information is newer, which is better supported, and whether the discrepancy could be context-dependent.",
      "- Never silently discard the user's observations. Preserve each perspective.",
      "- Compare recency, source quality, confidence, validation, and agreement across all sources.",
    );
    sections.push(lines.join("\n"));
  } else if (params.hasOI && !params.hasFactionOI && !params.hasExchangeOI && !params.hasExternalResearch) {
    sections.push(
      "SOURCE HANDLING:",
      "- Personal Open Intelligence is provided below. Treat it as private user knowledge — potentially valuable but not automatically verified.",
      "- Conflicting signals between your trained knowledge and the user's Personal Open Intelligence should be surfaced explicitly: 'Your Personal Intelligence suggests X, while general knowledge indicates Y.'",
      "- Never silently discard the user's observations. Preserve them as a perspective.",
    );
  } else if (params.hasExchangeOI && !params.hasOI && !params.hasFactionOI && !params.hasExternalResearch) {
    sections.push(
      "SOURCE HANDLING:",
      "- Licensed Exchange Intelligence is provided below. Treat it as valuable experience, not automatically verified fact.",
      "- Do not imply the buyer owns this intelligence. Compare against your trained knowledge. When conflicts exist, surface them.",
    );
  } else {
    sections.push(
      "SOURCE HANDLING:",
      "- No personal intelligence, faction intelligence, exchange intelligence, or current research was found for this query. Base your response on trained knowledge and conversation context.",
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
  factionOIContext?: string;
  exchangeOIContext?: string;
  conversationContext: ConversationMessage[];
  prompt: string;
}): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const systemParts = [params.systemPrompt];

  if (params.oiContext) {
    systemParts.push(params.oiContext);
  }

  if (params.factionOIContext) {
    systemParts.push(params.factionOIContext);
  }

  if (params.exchangeOIContext) {
    systemParts.push(params.exchangeOIContext);
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
  const executionId = crypto.randomUUID();
  const threadId = payload.threadId ?? null;
  const messageId = payload.messageId ?? null;

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
  let rankedPersonalEntries: OpenIntelligenceRow[] = [];

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
      rankedPersonalEntries = ranked;
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

  // ── Faction Intelligence retrieval ──────────────────────────────────────
  let factionOIContext = "";
  let factionOICount = 0;
  let rankedFactionEntries: FactionOIEntry[] = [];

  // Only retrieve faction intelligence for paid users with an active faction
  const isPaid = await isPaidUser(supabase, userId);
  if (isPaid) {
    const factionResult = await retrieveFactionOpenIntelligence(supabase, userId, prompt, sessionType);
    if (factionResult.entries.length > 0) {
      const factionTokenBudget = sessionOITokenBudget(sessionType);
      const factionFormatted = formatFactionOIContext(factionResult.entries, factionTokenBudget);
      factionOIContext = factionFormatted.text;
      factionOICount = factionFormatted.count;
      rankedFactionEntries = factionResult.entries;

      console.log("[analyst] Faction OI retrieval", {
        factionCount: factionOICount,
        sessionType,
      });
    } else {
      console.log("[analyst] Faction OI retrieval: no relevant shared entries found");
    }
  } else {
    console.log("[analyst] Faction OI retrieval skipped — free user");
  }

  // ── Exchange Intelligence retrieval ────────────────────────────────────
  let exchangeOIContext = "";
  let exchangeOICount = 0;
  let exchangeSyncCount = 0;
  let exchangeVendorEagohCount = 0;
  let rankedExchangeEntries: OpenIntelligenceRow[] = [];
  let exchangePurchaseMap: Map<string, { purchaseId: string; syncPercentage: number }> = new Map();

  // Only retrieve Exchange intelligence for paid users
  if (isPaid) {
    const serviceClient = getServiceRoleClient(env);
    if (serviceClient) {
      const exchangeResult = await retrieveExchangeOpenIntelligence(serviceClient, userId, prompt, sessionType);
      exchangeSyncCount = exchangeResult.syncCount;
      exchangeVendorEagohCount = exchangeResult.vendorEagohCount;

      if (exchangeResult.used && exchangeResult.entries.length > 0) {
        const exchangeTokenBudget = sessionOITokenBudget(sessionType);
        const exchangeFormatted = formatExchangeOIContext(exchangeResult, exchangeTokenBudget);
        exchangeOIContext = exchangeFormatted.text;
        exchangeOICount = exchangeFormatted.count;
        rankedExchangeEntries = exchangeResult.entries;
        exchangePurchaseMap = exchangeResult.entryPurchaseMap;

        console.log("[analyst] Exchange OI retrieval", {
          exchangeCount: exchangeOICount,
          syncCount: exchangeSyncCount,
          vendorEagohCount: exchangeVendorEagohCount,
          sessionType,
        });
      } else if (exchangeResult.syncCount > 0) {
        console.log("[analyst] Exchange OI retrieval: active syncs found but no relevant entries");
      } else {
        console.log("[analyst] Exchange OI retrieval: no active syncs");
      }
    } else {
      console.log("[analyst] Exchange OI retrieval skipped — service role key not configured");
    }
  } else {
    console.log("[analyst] Exchange OI retrieval skipped — free user");
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
    hasFactionOI: factionOICount > 0,
    hasExchangeOI: exchangeOICount > 0,
    hasExternalResearch: externalResearchResult.used,
  });

  const messages = buildMessages({
    systemPrompt,
    oiContext,
    externalResearchContext,
    factionOIContext,
    exchangeOIContext,
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
        factionIntelligenceUsed: factionOICount > 0,
        factionIntelligenceCount: factionOICount,
        exchangeIntelligenceUsed: exchangeOICount > 0,
        exchangeIntelligenceCount: exchangeOICount,
        externalSearchUsed: externalResearchResult.used,
        sourceCount: externalResearchResult.sources.length,
        exchangeAccess: exchangeSyncCount > 0 ? {
          activeSyncCount: exchangeSyncCount,
          vendorEagohCount: exchangeVendorEagohCount,
        } : undefined,
      };

      console.log("[analyst] success", {
        replyLen: reply.length,
        personalOIUsed: grounding.personalOpenIntelligenceUsed,
        personalOICount: grounding.personalOpenIntelligenceCount,
        factionOIUsed: grounding.factionIntelligenceUsed,
        factionOICount: grounding.factionIntelligenceCount,
        exchangeOIUsed: grounding.exchangeIntelligenceUsed,
        exchangeOICount: grounding.exchangeIntelligenceCount,
        externalSearchUsed: grounding.externalSearchUsed,
        sourceCount: grounding.sourceCount,
        hasEagoh: !!payload.eagohId,
      });

      // ── Phase 5A: Write audit records (best-effort, never fails the session) ──
      const auditClient = getServiceRoleClient(env);
      if (auditClient) {
        const confidence = confidenceMap[sessionType];
        const auditEntries: AuditEntryRecord[] = [];

        // Personal OI entries
        for (let i = 0; i < rankedPersonalEntries.length; i++) {
          const e = rankedPersonalEntries[i];
          auditEntries.push({
            execution_id: executionId,
            requesting_user_id: userId,
            source_type: "personal",
            source_entry_id: e.id,
            source_owner_id: e.user_id,
            source_eagoh_id: e.eagoh_id,
            faction_id: null,
            exchange_purchase_id: null,
            relevance_score: null,
            source_rank: i + 1,
            sync_percentage: null,
            source_created_at: e.created_at,
            source_category: e.selected_category ?? null,
            source_validation_status: e.validation_status,
            source_quality_score: e.quality_score,
            source_confidence_level: e.confidence_level,
            external_url_hash: null,
            external_publisher: null,
            session_type: sessionType,
            selected_eagoh_id: payload.eagohId ?? null,
            analyst_thread_id: threadId,
            analyst_message_id: messageId,
          });
        }

        // Faction OI entries
        for (let i = 0; i < rankedFactionEntries.length; i++) {
          const e = rankedFactionEntries[i];
          auditEntries.push({
            execution_id: executionId,
            requesting_user_id: userId,
            source_type: "faction",
            source_entry_id: e.id,
            source_owner_id: e.contributor_user_id,
            source_eagoh_id: e.eagoh_id,
            faction_id: e.faction_id,
            exchange_purchase_id: null,
            relevance_score: null,
            source_rank: i + 1,
            sync_percentage: null,
            source_created_at: e.created_at,
            source_category: e.selected_category ?? null,
            source_validation_status: e.validation_status,
            source_quality_score: e.quality_score,
            source_confidence_level: e.confidence_level,
            external_url_hash: null,
            external_publisher: null,
            session_type: sessionType,
            selected_eagoh_id: payload.eagohId ?? null,
            analyst_thread_id: threadId,
            analyst_message_id: messageId,
          });
        }

        // Exchange OI entries
        for (let i = 0; i < rankedExchangeEntries.length; i++) {
          const e = rankedExchangeEntries[i];
          const purchaseInfo = exchangePurchaseMap.get(e.id);
          auditEntries.push({
            execution_id: executionId,
            requesting_user_id: userId,
            source_type: "exchange",
            source_entry_id: e.id,
            source_owner_id: e.user_id,
            source_eagoh_id: e.eagoh_id,
            faction_id: null,
            exchange_purchase_id: purchaseInfo?.purchaseId ?? null,
            relevance_score: null,
            source_rank: i + 1,
            sync_percentage: purchaseInfo?.syncPercentage ?? null,
            source_created_at: e.created_at,
            source_category: e.selected_category ?? null,
            source_validation_status: e.validation_status,
            source_quality_score: e.quality_score,
            source_confidence_level: e.confidence_level,
            external_url_hash: null,
            external_publisher: null,
            session_type: sessionType,
            selected_eagoh_id: payload.eagohId ?? null,
            analyst_thread_id: threadId,
            analyst_message_id: messageId,
          });
        }

        // External research sources
        for (let i = 0; i < externalResearchResult.sources.length; i++) {
          const src = externalResearchResult.sources[i];
          auditEntries.push({
            execution_id: executionId,
            requesting_user_id: userId,
            source_type: "external_research",
            source_entry_id: null,
            source_owner_id: null,
            source_eagoh_id: null,
            faction_id: null,
            exchange_purchase_id: null,
            relevance_score: null,
            source_rank: i + 1,
            sync_percentage: null,
            source_created_at: null,
            source_category: null,
            source_validation_status: null,
            source_quality_score: null,
            source_confidence_level: null,
            external_url_hash: hashUrl(src.url),
            external_publisher: extractPublisher(src.url),
            session_type: sessionType,
            selected_eagoh_id: payload.eagohId ?? null,
            analyst_thread_id: threadId,
            analyst_message_id: messageId,
          });
        }

        void writeAuditRecords(auditClient, {
          executionId,
          userId,
          sessionType,
          selectedEagohId: payload.eagohId ?? null,
          threadId,
          messageId,
          model: "gpt-4o-mini",
          confidence,
          auditEntries,
          externalSearchUsed: externalResearchResult.used,
        });
      }

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
