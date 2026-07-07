/**
 * EAGOH Analyst Chat — Cloudflare Worker (Phase 9A — security audit + analytics route fix)
 * Phase 6C — notifications & audit history)
 * Phase 6B: entry management, moderation, is_admin access.
 * Phase 6C: intelligence notifications, moderation audit trail, notification center.
 * Phase 6C-deploy: worker bundling fix.
 * Phase 8A: secure owner-scoped intelligence analytics endpoint (deploy).
 *
 * Secure server-side intelligence grounding system.
 * Column names synchronized with live Supabase schema.
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
 * Phase 4B — Harden and Verify Exchange Intelligence (deployed).
 * Phase 5A — Intelligence Usage Auditing and Source Provenance (deployed).
 * Phase 5B — Human Intelligence Quality, Validation, and Reputation (deployed).
 * Phase 5B Security — Locked down feedback, disputes, reputation, versions, rate-limits to server-only.
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
  exchange_share_enabled?: boolean;
  staleness_score?: number;
  outdated_flag?: boolean;
  content_hash?: string | null;
  duplicate_flag?: boolean;
  active_dispute_count?: number;
  version_number?: number;
  created_at: string;
  updated_at: string;
};

/** Validation statuses used in Phase 5B — includes disputed (reduced weight at ranking).
 *  Legacy "validated" is accepted temporarily for unmigrated rows. */
const VALID_USEABLE_STATUSES = [
  "pending_review",
  "community_supported",
  "externally_supported",
  "disputed",
  "validated", // legacy compatibility for unmigrated rows
] as const;

/** Validation statuses that must be excluded from analyst context. */
const EXCLUDED_STATUSES = ["rejected", "withdrawn"] as const;

/** Contributor reputation row — only overall_score is needed for ranking.
 *  Full internal fields are accessed via service_role only. */
type ContributorReputation = {
  user_id: string;
  overall_score: number;
  calculated_at?: string;
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
    .in("validation_status", [...VALID_USEABLE_STATUSES]);

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
  // Phase 5B: Fetch contributor reputations for ranking
  const contributorIds = [...new Set(factionEntries.map((e) => e.contributor_user_id).filter(Boolean))];
  const repMap = await fetchReputationsForUsers(supabase, contributorIds);
  const ranked = rankEntries(factionEntries, query, Math.min(limit, factionEntries.length), repMap);
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
    .in("validation_status", [...VALID_USEABLE_STATUSES])
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

function validationMultiplier(status: string): number {
  switch (status) {
    case "externally_supported":
    case "community_supported":
      return 1.15;
    case "pending_review":
      return 1.0;
    case "disputed":
      // Reduced weight — disputed entries stay in context but get a warning label
      return 0.6;
    // rejected and withdrawn are filtered before ranking, but handle defensively
    case "rejected":
    case "withdrawn":
      return 0.0;
    default:
      return 1.0;
  }
}

/** Backward-compat alias for old callers. */
function validationBonus(status: string): number {
  return validationMultiplier(status);
}

/** Reputation lookup cache per request — avoids repeated queries for the same vendor. */
function createReputationCache() {
  const cache = new Map<string, ContributorReputation | null>();
  return {
    get: (userId: string) => cache.get(userId),
    set: (userId: string, rep: ContributorReputation | null) => cache.set(userId, rep),
  };
}

/** Fetch contributor reputation for a user. Returns null if not found. */
async function fetchReputation(
  serviceClient: SupabaseClient,
  userId: string,
  cache: ReturnType<typeof createReputationCache>,
): Promise<ContributorReputation | null> {
  const cached = cache.get(userId);
  if (cached !== undefined) return cached;

  const { data, error } = await serviceClient
    .from("intelligence_contributor_reputation")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    cache.set(userId, null);
    return null;
  }

  const rep = data as ContributorReputation;
  cache.set(userId, rep);
  return rep;
}

/**
 * Compute a reputation multiplier for ranking.
 *
 * Reputation is a SUPPORTING factor (0.9–1.1), NOT the dominant factor.
 * A high-reputation contributor's irrelevant entry cannot outrank a
 * highly relevant lower-reputation entry.
 *
 * Formula: map 0–100 score to 0.9–1.1 range.
 */
function reputationMultiplier(rep: ContributorReputation | null): number {
  if (!rep) return 1.0;
  // 50 = neutral (1.0), 100 = max boost (1.1), 0 = penalty (0.9)
  return 0.9 + (rep.overall_score / 100) * 0.2;
}

/**
 * Staleness penalty: outdated entries receive reduced weight.
 * staleness_score 0 = no penalty, 100 = 50% score reduction.
 */
function stalenessPenalty(entry: OpenIntelligenceRow): number {
  const staleness = entry.staleness_score ?? 0;
  if (staleness <= 0) return 1.0;
  return 1.0 - (staleness / 100) * 0.5;
}

function scoreEntry(
  entry: OpenIntelligenceRow,
  queryTokens: string[],
  reputationRep?: ContributorReputation | null,
): number {
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

  score *= validationMultiplier(entry.validation_status);

  // Staleness penalty (Phase 5B)
  score *= stalenessPenalty(entry);

  // Reputation as supporting factor (Phase 5B) — max ±10% adjustment
  if (reputationRep) {
    score *= reputationMultiplier(reputationRep);
  }

  const ageDays = (Date.now() - new Date(entry.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 30) {
    score += Math.max(0, (30 - ageDays) / 30);
  }

  return Math.round(score * 100) / 100;
}

/** Pre-populated reputation map: user_id → reputation (or null if not found). */
type ReputationMap = Map<string, ContributorReputation | null>;

/**
 * Batch-fetch contributor reputations for a set of user IDs.
 * Uses the safe public view public_contributor_reputation which exposes only
 * user_id, overall_score, and calculated_at — no internal penalty or component data.
 */
async function fetchReputationsForUsers(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<ReputationMap> {
  const result: ReputationMap = new Map();
  if (userIds.length === 0) return result;

  const unique = [...new Set(userIds)];
  const { data, error } = await supabase
    .from("public_contributor_reputation")
    .select("user_id, overall_score, calculated_at")
    .in("user_id", unique);

  if (error || !data) {
    // Non-fatal: rank without reputation data
    console.warn("[analyst] reputation batch fetch failed", error?.message);
    for (const id of unique) result.set(id, null);
    return result;
  }

  for (const row of data as ContributorReputation[]) {
    result.set(row.user_id, row);
  }
  // Fill missing users with null
  for (const id of unique) {
    if (!result.has(id)) result.set(id, null);
  }
  return result;
}

function rankEntries(
  entries: OpenIntelligenceRow[],
  query: string,
  topN: number,
  reputationMap?: ReputationMap,
): OpenIntelligenceRow[] {
  if (entries.length === 0) return [];

  // Filter out rejected and withdrawn entries before ranking (Phase 5B)
  const eligible = entries.filter(
    (e) => !EXCLUDED_STATUSES.includes(e.validation_status as (typeof EXCLUDED_STATUSES)[number]),
  );
  if (eligible.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return eligible.slice(0, topN);
  }

  const scored = eligible
    .map((entry) => {
      const rep = reputationMap?.get(entry.user_id) ?? null;
      return { entry, score: scoreEntry(entry, queryTokens, rep) };
    })
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

// ── Source Transparency (Phase 5B) ───────────────────────────────────────────

/**
 * Format a human-readable validation label for source transparency.
 * Maps validation_status to clear language the AI model uses in responses.
 */
function formatValidationLabel(status: string): string {
  switch (status) {
    case "externally_supported":
      return "Externally supported";
    case "community_supported":
      return "Community supported";
    case "disputed":
      return "Disputed (reduced weight — treat with caution)";
    case "rejected":
      return "Rejected";
    case "withdrawn":
      return "Withdrawn";
    case "pending_review":
    default:
      return "Pending review (unverified human experience)";
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

    const validationLabel = formatValidationLabel(entry.validation_status);
    const stalenessNote = entry.outdated_flag ? " [OUTDATED]" : (entry.staleness_score && entry.staleness_score > 50 ? " [AGING]" : "");

    return `[OI Entry ${i + 1}]
Category: ${entry.selected_category ?? "General"}
Tags: ${tagLine}
Confidence: ${confidenceLabel}
Quality: ${quality}/100
Influence: ${influence}/100
Validation: ${validationLabel}${stalenessNote}
Created: ${date}
Content: ${content}`;
  });

  const text = `PERSONAL OPEN INTELLIGENCE — USER PROVIDED (${entries.length} entries)
Personal Open Intelligence is private, user-provided knowledge. Treat it as potentially valuable real-world experience, but not automatically verified fact. Consider relevance, confidence, validation status, quality, and recency. Do not call an entry "verified fact" unless its validation status truly supports that wording.

${blocks.join("\n\n")}`;

  return { text, count: entries.length };
}

// ── Exchange Intelligence (Phase 4B hardened) ────────────────────────────────

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
 * Centralized active-sync validation.
 *
 * A sync purchase is active ONLY when ALL of the following are true:
 *   - active = true (single source of truth — all invalid states set this to false)
 *   - buyer_id matches the authenticated user
 *   - started_at is at or before server time
 *   - expires_at is strictly after server time
 *   - sync_level is a valid percentage (25, 50, 75, 100)
 *   - listing exists and is active
 *   - listing.vendor_id matches purchase.vendor_id (defense in depth)
 *   - listing.eagoh_id matches purchase.eagoh_id (defense in depth)
 *   - vendor EAGOH exists, is not deleted/suspended
 *   - EAGOH owner equals verified vendor ID (defense in depth)
 *
 * The marketplace_sync_purchases table uses `active` as the single invalidation
 * flag. Refunds, cancellations, revocations, and disputes must all set
 * `active = false` on the purchase row. No separate refunded/revoked/cancelled
 * columns exist — access is denied when active = false for any reason.
 *
 * Uses the worker's server clock. Prefer DB time (SELECT now()) when the
 * worker can reach Supabase without excessive latency, but worker time is
 * sufficient for short-lived syncs (1–5 days).
 */
function isExchangeSyncActive(
  purchase: {
    id: string;
    listing_id: string;
    buyer_id: string;
    vendor_id: string;
    eagoh_id: string;
    sync_level: string;
    started_at: string;
    expires_at: string;
    active: boolean;
  },
  userId: string,
  serverNow: string,
): { valid: false; reason: string } | { valid: true } {
  // 1. Buyer must be the authenticated user
  if (purchase.buyer_id !== userId) {
    return { valid: false, reason: "buyer_mismatch" };
  }

  // 2. Active flag (single source of truth for all invalid states)
  if (!purchase.active) {
    return { valid: false, reason: "inactive" };
  }

  // 3. Start time must have been reached
  if (purchase.started_at > serverNow) {
    return { valid: false, reason: "not_started" };
  }

  // 4. Expiration must be in the future (strict — at or past = expired)
  if (purchase.expires_at <= serverNow) {
    return { valid: false, reason: "expired" };
  }

  // 5. Valid sync percentage
  const pct = parseInt(purchase.sync_level.replace("%", ""), 10);
  if (![25, 50, 75, 100].includes(pct)) {
    return { valid: false, reason: "invalid_percentage" };
  }

  return { valid: true };
}

/**
 * Get all active Exchange syncs for the authenticated buyer.
 *
 * Flow:
 *   1. Query purchases where buyer_id matches and active = true
 *   2. Run isExchangeSyncActive for each candidate
 *   3. For valid syncs, verify the listing consistency (vendor_id, eagoh_id match)
 *   4. Verify the EAGOH still exists, is active, and owner matches vendor
 *   5. Return only fully verified sync records
 *
 * Inconsistent listing data, missing EAGOHs, or ownership mismatches result in
 * the sync being silently excluded (logged as a warning) — the analyst session
 * continues without Exchange intelligence.
 */
async function getActiveExchangeSyncs(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<ExchangeSyncRecord[]> {
  // Use worker server time for initial query filtering. The centralized
  // isExchangeSyncActive function applies final server-time checks.
  const serverNow = new Date().toISOString();

  const { data, error } = await serviceClient
    .from("marketplace_sync_purchases")
    .select("id, listing_id, buyer_id, vendor_id, eagoh_id, sync_level, started_at, expires_at, active")
    .eq("buyer_id", userId)
    .eq("active", true)
    .lte("started_at", serverNow)
    .gt("expires_at", serverNow);

  if (error || !data || data.length === 0) {
    if (error) console.warn("[analyst] exchange syncs query failed", error.message);
    console.log("[analyst:diag] active sync candidates found: 0");
    return [];
  }

  const candidates = data as Array<{
    id: string;
    listing_id: string;
    buyer_id: string;
    vendor_id: string;
    eagoh_id: string;
    sync_level: string;
    started_at: string;
    expires_at: string;
    active: boolean;
  }>;

  console.log("[analyst:diag] active sync candidates found:", candidates.length);

  const validSyncs: ExchangeSyncRecord[] = [];

  for (const row of candidates) {
    // ── 1. Centralized status check ──
    const statusCheck = isExchangeSyncActive(row, userId, serverNow);
    if (!statusCheck.valid) {
      console.warn("[analyst:diag] sync excluded —", statusCheck.reason, {
        purchaseId: row.id.slice(0, 8),
        buyerId: row.buyer_id.slice(0, 8),
      });
      continue;
    }

    const pct = parseInt(row.sync_level.replace("%", ""), 10);

    // ── 2. Listing consistency check ──
    const { data: listing, error: listingErr } = await serviceClient
      .from("marketplace_listings")
      .select("id, vendor_id, eagoh_id, active")
      .eq("id", row.listing_id)
      .maybeSingle();

    if (listingErr || !listing) {
      console.warn("[analyst:diag] sync excluded — listing not found", {
        purchaseId: row.id.slice(0, 8),
        listingId: row.listing_id.slice(0, 8),
      });
      continue;
    }

    const listingRow = listing as { id: string; vendor_id: string; eagoh_id: string; active: boolean };

    if (!listingRow.active) {
      console.warn("[analyst:diag] sync excluded — listing inactive", {
        listingId: row.listing_id.slice(0, 8),
      });
      continue;
    }

    // ── 3. Defense in depth: verify listing references match purchase ──
    if (listingRow.vendor_id !== row.vendor_id) {
      console.warn("[analyst:diag] sync excluded — listing vendor mismatch", {
        purchaseId: row.id.slice(0, 8),
        purchaseVendor: row.vendor_id.slice(0, 8),
        listingVendor: listingRow.vendor_id.slice(0, 8),
      });
      continue;
    }

    if (listingRow.eagoh_id !== row.eagoh_id) {
      console.warn("[analyst:diag] sync excluded — listing eagoh mismatch", {
        purchaseId: row.id.slice(0, 8),
        purchaseEagoh: row.eagoh_id.slice(0, 8),
        listingEagoh: listingRow.eagoh_id.slice(0, 8),
      });
      continue;
    }

    // ── 4. Vendor EAGOH existence and ownership check ──
    const { data: eagoh, error: eagohErr } = await serviceClient
      .from("eagohs")
      .select("id, user_id, name, status")
      .eq("id", row.eagoh_id)
      .maybeSingle();

    if (eagohErr || !eagoh) {
      console.warn("[analyst:diag] sync excluded — vendor EAGOH not found", {
        eagohId: row.eagoh_id.slice(0, 8),
      });
      continue;
    }

    const eagohRow = eagoh as { id: string; user_id: string; name?: string; status?: string };

    // Verify EAGOH is active (not deleted or suspended)
    if (eagohRow.status && eagohRow.status !== "active") {
      console.warn("[analyst:diag] sync excluded — vendor EAGOH status:", eagohRow.status, {
        eagohId: row.eagoh_id.slice(0, 8),
      });
      continue;
    }

    // Verify owner matches verified vendor (defense in depth)
    if (eagohRow.user_id !== row.vendor_id) {
      console.warn("[analyst:diag] sync excluded — EAGOH owner mismatch", {
        eagohId: row.eagoh_id.slice(0, 8),
        eagohOwner: eagohRow.user_id.slice(0, 8),
        vendorId: row.vendor_id.slice(0, 8),
      });
      continue;
    }

    console.log("[analyst:diag] listing consistency passed", {
      purchaseId: row.id.slice(0, 8),
      listingId: row.listing_id.slice(0, 8),
      vendorEagohId: row.eagoh_id.slice(0, 8),
    });

    validSyncs.push({
      purchaseId: row.id,
      listingId: row.listing_id,
      vendorId: row.vendor_id,
      vendorEagohId: row.eagoh_id,
      syncPercentage: pct,
      startsAt: row.started_at,
      expiresAt: row.expires_at,
      vendorEagohName: eagohRow.name ?? undefined,
    });
  }

  console.log("[analyst:diag] valid syncs after all checks:", validSyncs.length);
  return validSyncs;
}

/**
 * Compute a stable vendor-entry access ordering independent of the current question.
 *
 * Ordering factors (descending):
 *   - quality_score
 *   - validated entries first
 *   - influence_score
 *   - confidence level (verified_observation > strong > moderate > weak)
 *   - recency (newer first)
 *   - entry ID as deterministic tie-breaker (ensures stable ordering)
 */
function stableCohortOrder(entries: OpenIntelligenceRow[]): OpenIntelligenceRow[] {
  return [...entries].sort((a, b) => {
    // Quality first
    if (b.quality_score !== a.quality_score) return b.quality_score - a.quality_score;
    // Supported entries come first (Phase 5B: community_supported / externally_supported > pending_review > disputed)
    const validationRank: Record<string, number> = {
      externally_supported: 3, community_supported: 2,
      pending_review: 1, disputed: 0,
      rejected: -1, withdrawn: -1,
    };
    const aValRank = validationRank[a.validation_status] ?? 0;
    const bValRank = validationRank[b.validation_status] ?? 0;
    if (aValRank !== bValRank) return bValRank - aValRank;
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
    // Recency — newer entries first
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    if (aTime !== bTime) return bTime - aTime;
    // Stable tie-breaker: entry ID (deterministic, never changes)
    return a.id.localeCompare(b.id);
  });
}

/**
 * Retrieve Exchange Open Intelligence for the authenticated buyer.
 *
 * Correct pipeline order:
 *   1. Load active Exchange syncs (with listing + EAGOH consistency checks)
 *   2. For each verified vendor EAGOH, load eligible OI entries
 *      - entry.user_id MUST equal verified vendor ID (defense in depth)
 *      - entry.eagoh_id MUST equal verified vendor EAGOH ID
 *      - exchange_share_enabled MUST be true
 *      - validation_status must be pending_review, community_supported, or externally_supported
 *   3. Deduplicate by entry ID
 *   4. Build stable ordering (independent of query)
 *   5. Apply purchased percentage to create accessible cohort
 *   6. Rank the accessible cohort against the current question
 *   7. Apply session entry limits
 */
async function retrieveExchangeOpenIntelligence(
  serviceClient: SupabaseClient,
  userId: string,
  query: string,
  sessionType: SessionType,
): Promise<ExchangeResearchResult> {
  const emptyResult = { used: false as const, entries: [] as OpenIntelligenceRow[], syncCount: 0, vendorEagohCount: 0, entryPurchaseMap: new Map<string, { purchaseId: string; syncPercentage: number }>() };

  const syncs = await getActiveExchangeSyncs(serviceClient, userId);

  if (syncs.length === 0) {
    console.log("[analyst:diag] no valid syncs after status checks");
    return emptyResult;
  }

  // Build maps: vendor EAGOH ID → sync percentage, vendor ID set
  const pctMap = new Map<string, number>();
  const vendorIdByEagohId = new Map<string, string>();

  for (const s of syncs) {
    const existing = pctMap.get(s.vendorEagohId) ?? 0;
    pctMap.set(s.vendorEagohId, Math.max(existing, s.syncPercentage));
    vendorIdByEagohId.set(s.vendorEagohId, s.vendorId);
  }

  const vendorEagohIds = [...new Set(syncs.map((s) => s.vendorEagohId))];

  // Load eligible OI entries per vendor EAGOH with explicit vendor ownership filter
  const eligibleMap = new Map<string, OpenIntelligenceRow[]>();

  for (const eagohId of vendorEagohIds) {
    const vendorId = vendorIdByEagohId.get(eagohId);
    if (!vendorId) continue;

    // Defense in depth: explicitly filter by vendor user_id AND eagoh_id
    const { data, error } = await serviceClient
      .from("open_intelligence")
      .select("*")
      .eq("user_id", vendorId)
      .eq("eagoh_id", eagohId)
      .eq("exchange_share_enabled", true)
      .in("validation_status", [...VALID_USEABLE_STATUSES])
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.warn("[analyst:diag] exchange OI fetch failed", { eagohId: eagohId.slice(0, 8), error: error.message });
      continue;
    }

    if (data && data.length > 0) {
      eligibleMap.set(eagohId, data as OpenIntelligenceRow[]);
      console.log("[analyst:diag] vendor ownership passed — eligible entries:", data.length, { eagohId: eagohId.slice(0, 8) });
    } else {
      console.log("[analyst:diag] no eligible entries for vendor EAGOH", { eagohId: eagohId.slice(0, 8) });
    }
  }

  // Deduplicate across EAGOHs
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
    console.log("[analyst:diag] eligible vendor entries: 0");
    return { ...emptyResult, syncCount: syncs.length, vendorEagohCount: vendorEagohIds.length };
  }

  console.log("[analyst:diag] eligible vendor entries:", allEligible.length);

  // ── Stable cohort + percentage enforcement ──
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

    console.log("[analyst:diag] stable cohort applied", {
      eagohId: eagohId.slice(0, 8),
      eligibleTotal: entries.length,
      syncPercentage: pct,
      accessibleCohortSize: accessibleCount,
    });
  }

  console.log("[analyst:diag] total accessible cohort size:", accessible.length);

  // ── Rank accessible cohort against current question ──
  const limit = sessionExchangeOILimit(sessionType);

  // Phase 5B: Fetch vendor contributor reputations for ranking
  const vendorIds = [...new Set(syncs.map((s) => s.vendorId))];
  const vendorRepMap = await fetchReputationsForUsers(serviceClient, vendorIds);

  const ranked = accessible.length > 0
    ? rankEntries(accessible, query, Math.min(limit, accessible.length), vendorRepMap)
    : [];

  console.log("[analyst:diag] final exchange entries selected:", ranked.length);

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

    const validationLabel = formatValidationLabel(entry.validation_status);
    const stalenessNote = entry.outdated_flag ? " [OUTDATED]" : "";

    return `[Exchange Entry ${i + 1}]
Category: ${entry.selected_category ?? "General"}
Tags: ${tagLine}
Confidence: ${confidenceLabel}
Quality: ${quality}/100
Validation: ${validationLabel}${stalenessNote}
Created: ${date}
Content: ${content}`;
  });

  const text = `EXCHANGE INTELLIGENCE — LICENSED HUMAN KNOWLEDGE (${result.entries.length} entries)
Exchange Intelligence contains human-provided knowledge temporarily licensed through an active synchronization purchase. Treat it as valuable experience, not automatically verified fact. Do not imply ownership by the buyer. Distinguish between community-supported, externally supported, disputed, and unverified experiential knowledge. Do not call an entry "verified fact" unless its validation status truly supports that wording.

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

    const validationLabel = formatValidationLabel(entry.validation_status);
    const stalenessNote = entry.outdated_flag ? " [OUTDATED]" : "";

    return `[Faction Entry ${i + 1}]
Category: ${entry.selected_category ?? "General"}
Tags: ${tagLine}
Confidence: ${confidenceLabel}
Quality: ${quality}/100
Validation: ${validationLabel}${stalenessNote}
Created: ${date}
Content: ${content}`;
  });

  const text = `FACTION INTELLIGENCE — SHARED HUMAN KNOWLEDGE (${entries.length} entries)
Faction Intelligence contains human-provided knowledge deliberately shared with authorized Faction members. Treat it as valuable experience, but not automatically verified fact. Compare it with Personal Open Intelligence and Current External Research. Distinguish between community-supported, externally supported, disputed, and unverified experiential knowledge. Do not call an entry "verified fact" unless its validation status truly supports that wording.

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

// ── Phase 5B: Server-side Quality Evaluation ─────────────────────────────────

/**
 * Evaluate Open Intelligence quality server-side.
 *
 * Scores observable qualities: detail, clarity, specificity, relevance,
 * internal consistency, supporting context, category/tag alignment, and
 * non-duplicative content.
 *
 * Quality means presentation and usefulness, NOT guaranteed truth.
 * Returns a score from 0–100.
 */
/**
 * Evaluate Open Intelligence quality server-side.
 *
 * Scores observable qualities: detail, clarity, specificity, relevance,
 * internal consistency, supporting context, category/tag alignment, and
 * non-duplicative content.
 *
 * Quality means presentation and usefulness, NOT guaranteed truth.
 * Returns a score from 0–100.
 *
 * Full spec signature: content, entryType, category, subtags, customTags,
 * confidenceLevel, userId. The userId is accepted for future per-user
 * baseline calibration but does not affect the score directly.
 */
function evaluateOpenIntelligenceQuality(params: {
  content: string;
  entryType?: string | null;
  category?: string | null;
  subtags?: string[] | null;
  customTags?: string[] | null;
  tags?: string[] | null;
  confidenceLevel: string;
  userId?: string;
}): number {
  const text = params.content.trim();
  if (text.length === 0) return 0;

  let score = 0;

  // 1. Detail: character count relative to expected ranges
  const charCount = text.replace(/\s/g, "").length;
  if (charCount >= 200) score += 20;
  else if (charCount >= 100) score += 15;
  else if (charCount >= 50) score += 10;
  else if (charCount >= 20) score += 5;

  // 2. Clarity: sentence structure (periods, commas, semicolons indicate structured writing)
  const sentenceCount = (text.match(/\./g) ?? []).length;
  const avgSentenceLen = sentenceCount > 0 ? text.length / sentenceCount : text.length;
  if (avgSentenceLen > 0 && avgSentenceLen < 200) score += 10; // readable sentences
  else if (avgSentenceLen > 0) score += 5;

  // 3. Specificity: proper nouns, numbers, entity mentions
  const properNouns = (text.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).length;
  const numbers = (text.match(/\b\d+(?:\.\d+)?/g) ?? []).length;
  score += Math.min(15, properNouns * 3 + numbers * 2);

  // 4. Category/tag alignment — deliberate categorization
  const allTags = [...(params.subtags ?? []), ...(params.customTags ?? []), ...(params.tags ?? [])];
  const tagCount = allTags.length + (params.category ? 1 : 0);
  score += Math.min(10, tagCount * 3);

  // 5. Entry-type depth bonus — deeper entries get slightly more credit
  const entryTypeBonus: Record<string, number> = {
    quick_observation: 0,
    basic_deep_entry: 4,
    advanced_deep_entry: 8,
  };
  score += entryTypeBonus[params.entryType ?? ""] ?? 0;

  // 6. Confidence alignment — higher confidence claims get slight quality credit
  // (but quality is about presentation, not truth)
  const confidenceBoost: Record<string, number> = {
    verified_observation: 5,
    strong_confidence: 4,
    moderate_confidence: 3,
    weak_suspicion: 1,
  };
  score += confidenceBoost[params.confidenceLevel] ?? 2;

  // 7. Supporting context: mentions of sources, references, evidence
  const supportKeywords = ["because", "according to", "source", "evidence", "observed", "measured", "reported", "data", "study", "analysis"];
  const lowerText = text.toLowerCase();
  const supportCount = supportKeywords.filter((k) => lowerText.includes(k)).length;
  score += Math.min(10, supportCount * 3);

  // 8. Internal consistency: absence of obvious contradictions
  const negationPairs = (text.match(/\bnot\b|\bnever\b|\bcannot\b|\bcan't\b|\bdon't\b/gi) ?? []).length;
  if (negationPairs <= 2) score += 5;

  // 9. Non-duplicative content — penalize repeated phrases (keyword stuffing)
  const words = text.toLowerCase().split(/\s+/);
  const wordFreq = new Map<string, number>();
  for (const w of words) {
    if (w.length > 3) wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1);
  }
  const repeatedWords = [...wordFreq.values()].filter((c) => c > 3).length;
  if (repeatedWords === 0) score += 5;
  else score -= Math.min(10, repeatedWords * 2);

  // 10. Low-effort detection: very short, meaningless, or keyword-stuffed content
  const meaningfulWords = words.filter((w) => w.length > 2).length;
  if (meaningfulWords < 5) score -= 15;

  return Math.max(0, Math.min(100, score));
}

/**
 * Compute an influence baseline (0–100) from quality, confidence, and entry type.
 * Server-authoritative — the client must not set influence_score directly.
 */
function computeInfluenceBaseline(qualityScore: number, confidenceLevel: string, entryType?: string | null): number {
  const confidenceMultiplier: Record<string, number> = {
    verified_observation: 1.15,
    strong_confidence: 1.0,
    moderate_confidence: 0.85,
    weak_suspicion: 0.65,
  };
  const typeMultiplier: Record<string, number> = {
    quick_observation: 0.8,
    basic_deep_entry: 1.0,
    advanced_deep_entry: 1.15,
  };
  const raw = qualityScore * 0.7 * (confidenceMultiplier[confidenceLevel] ?? 0.8) * (typeMultiplier[entryType ?? ""] ?? 1.0) + qualityScore * 0.3;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** Simple hash for duplicate detection. */
function contentHash(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return "ch_" + Math.abs(hash).toString(16).slice(0, 16);
}

/** Normalize text for near-duplicate comparison. */
function normalizeForComparison(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
}

/**
 * Check for duplicates: exact hash match or high Jaccard similarity.
 * Returns the existing entry ID if a duplicate is found, null otherwise.
 */
function findDuplicate(
  entries: { id: string; content: string; content_hash?: string | null }[],
  newContent: string,
  newHash: string,
): string | null {
  const normalizedNew = normalizeForComparison(newContent);
  const newTokens = new Set(normalizedNew.split(" ").filter((w) => w.length > 2));

  for (const entry of entries) {
    // Exact hash match
    if (entry.content_hash === newHash) return entry.id;

    // Near-duplicate: Jaccard similarity > 0.8
    const normalizedEntry = normalizeForComparison(entry.content);
    const entryTokens = new Set(normalizedEntry.split(" ").filter((w) => w.length > 2));
    if (newTokens.size === 0 || entryTokens.size === 0) continue;

    let intersection = 0;
    for (const t of newTokens) {
      if (entryTokens.has(t)) intersection++;
    }
    const union = newTokens.size + entryTokens.size - intersection;
    const jaccard = intersection / union;
    if (jaccard > 0.8) return entry.id;
  }

  return null;
}

// ── Phase 5B: Feedback Submission Handler ─────────────────────────────────────

/** Feedback type values allowed by the schema. */
const FEEDBACK_TYPES = [
  "helpful",
  "accurate_to_my_experience",
  "needs_context",
  "outdated",
  "incorrect",
  "misleading",
  "abusive",
] as const;

/** Access source values allowed by the live schema. */
const ACCESS_SOURCES = ["faction", "exchange", "approved_collaboration"] as const;

/** Daily feedback limit to prevent gaming. */
const MAX_DAILY_FEEDBACK = 20;
const MAX_DAILY_DISPUTES = 5;

async function handleSubmitFeedback(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  let payload: {
    entryId: string;
    feedbackType: string;
    optionalReason?: string;
    accessSource: string;
    factionId?: string;
    exchangePurchaseId?: string;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request." }, 400);
  }

  // Validate feedback type
  if (!FEEDBACK_TYPES.includes(payload.feedbackType as (typeof FEEDBACK_TYPES)[number])) {
    return jsonResponse({ ok: false, error: "Invalid feedback type." }, 400);
  }

  // Validate access source
  if (!ACCESS_SOURCES.includes(payload.accessSource as (typeof ACCESS_SOURCES)[number])) {
    return jsonResponse({ ok: false, error: "Invalid access source." }, 400);
  }

  // Authenticate
  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  const serviceClient = getServiceRoleClient(env);
  if (!serviceClient) {
    return jsonResponse({ ok: false, error: "Server configuration error." }, 503);
  }

  // 1. Fetch the entry to verify it exists and get owner + status + sharing flags
  const { data: entry, error: entryErr } = await serviceClient
    .from("open_intelligence")
    .select("id, user_id, validation_status, eagoh_id, exchange_share_enabled")
    .eq("id", payload.entryId)
    .maybeSingle();

  if (entryErr || !entry) {
    return jsonResponse({ ok: false, error: "Entry not found." }, 404);
  }

  const entryRow = entry as {
    id: string; user_id: string; validation_status: string;
    eagoh_id: string; exchange_share_enabled: boolean;
  };

  // 2. Prevent self-feedback
  if (entryRow.user_id === userId) {
    return jsonResponse({ ok: false, error: "Cannot provide feedback on your own entry." }, 403);
  }

  // 2b. Block feedback on rejected or withdrawn entries
  if (EXCLUDED_STATUSES.includes(entryRow.validation_status as (typeof EXCLUDED_STATUSES)[number])) {
    return jsonResponse({ ok: false, error: "Feedback is not available for rejected or withdrawn entries." }, 403);
  }

  // 3. Verify feedback eligibility — user must have legitimate access
  const canAccess = await verifyFeedbackEligibility(
    serviceClient,
    userId,
    entryRow.user_id,
    payload.entryId,
    entryRow.eagoh_id,
    entryRow.exchange_share_enabled,
    payload.accessSource,
    payload.factionId,
    payload.exchangePurchaseId,
  );

  if (!canAccess) {
    return jsonResponse({ ok: false, error: "You do not have authorized access to this intelligence." }, 403);
  }

  // 4. Anti-gaming: check daily rate limits
  const rateLimitOk = await checkAndUpdateRateLimits(serviceClient, userId, "feedback");
  if (!rateLimitOk) {
    return jsonResponse({ ok: false, error: "Daily feedback limit reached. Please try again tomorrow." }, 429);
  }

  // 5. Check for anomaly patterns (basic)
  const anomalyFlag = await detectFeedbackAnomaly(serviceClient, userId);

  // 6. Upsert feedback (unique constraint on entry_id + reviewer_user_id)
  const { error: insertErr } = await serviceClient
    .from("open_intelligence_feedback")
    .upsert({
      entry_id: payload.entryId,
      reviewer_user_id: userId,
      feedback_type: payload.feedbackType,
      optional_reason: payload.optionalReason ?? null,
      access_source: payload.accessSource,
      faction_id: payload.factionId ?? null,
      exchange_purchase_id: payload.exchangePurchaseId ?? null,
    }, { onConflict: "entry_id,reviewer_user_id" });

  if (insertErr) {
    console.warn("[feedback] insert failed", insertErr.message);
    return jsonResponse({ ok: false, error: "Failed to submit feedback." }, 500);
  }

  // 7. Flag anomaly if detected (but don't reject — flag for review)
  if (anomalyFlag) {
    await serviceClient
      .from("feedback_rate_limits")
      .update({ anomaly_flag: true, anomaly_reason: "burst_or_targeting_pattern" })
      .eq("user_id", userId);
    console.warn("[feedback] anomaly flag set for user", { userId: userId.slice(0, 8) });
  }

  // 8. If feedback is 'outdated', trigger staleness evaluation
  if (payload.feedbackType === "outdated") {
    try {
      await serviceClient.rpc("evaluate_entry_staleness", { p_entry_id: payload.entryId });
    } catch (e) {
      // Non-fatal
      console.warn("[feedback] staleness eval failed", e instanceof Error ? e.message : "unknown");
    }
  }

  // 9. Recalculate the contributor's reputation (best-effort)
  try {
    await serviceClient.rpc("recalculate_contributor_reputation", { p_user_id: entryRow.user_id });
  } catch (e) {
    console.warn("[feedback] reputation recalc failed", e instanceof Error ? e.message : "unknown");
  }

  return jsonResponse({ ok: true });
}

/**
 * Verify that the reviewer had legitimate access to the intelligence entry.
 * Access is granted through: active faction membership with explicit sharing,
 * or an active Exchange synchronization purchase for the vendor's specific EAGOH.
 *
 * SECURITY: Does not trust client-supplied factionId or exchangePurchaseId
 * without full server-side verification of membership, purchase status,
 * vendor/EAGOH consistency, and entry sharing flags.
 */
async function verifyFeedbackEligibility(
  serviceClient: SupabaseClient,
  reviewerUserId: string,
  entryOwnerId: string,
  entryId: string,
  entryEagohId: string,
  entryExchangeShareEnabled: boolean,
  accessSource: string,
  factionId?: string,
  exchangePurchaseId?: string,
): Promise<boolean> {
  if (accessSource === "approved_collaboration") {
    // Approved collaboration routes would require additional admin verification
    // For now, deny from client requests unless future admin logic is added
    return false;
  }

  if (accessSource === "faction") {
    if (!factionId) return false;

    // 1. Verify reviewer is an active member of the faction
    const { data: membership } = await serviceClient
      .from("faction_members")
      .select("status")
      .eq("faction_id", factionId)
      .eq("user_id", reviewerUserId)
      .maybeSingle();

    if (!membership) return false;
    const memberStatus = (membership as { status: string }).status;
    // Accept active members and grace-period members
    if (memberStatus !== "active" && memberStatus !== "grace_period") return false;

    // 2. Verify the entry is explicitly shared with that faction
    const { data: shared } = await serviceClient
      .from("faction_shared_intelligence")
      .select("id, contributor_user_id")
      .eq("faction_id", factionId)
      .eq("oi_entry_id", entryId)
      .maybeSingle();

    if (!shared) return false;

    // 3. Verify the shared record's contributor matches the entry owner (defense in depth)
    const sharedRow = shared as { id: string; contributor_user_id: string };
    if (sharedRow.contributor_user_id !== entryOwnerId) return false;

    return true;
  }

  if (accessSource === "exchange") {
    // Must supply a specific purchase ID — do not accept any active purchase
    if (!exchangePurchaseId) return false;

    // Entry must have Exchange sharing enabled
    if (!entryExchangeShareEnabled) return false;

    // 1. Fetch the specific purchase and verify it belongs to the reviewer
    const { data: purchase } = await serviceClient
      .from("marketplace_sync_purchases")
      .select("id, buyer_id, vendor_id, eagoh_id, active, started_at, expires_at")
      .eq("id", exchangePurchaseId)
      .maybeSingle();

    if (!purchase) return false;

    const purchaseRow = purchase as {
      id: string; buyer_id: string; vendor_id: string; eagoh_id: string;
      active: boolean; started_at: string; expires_at: string;
    };

    // 2. Purchase buyer must equal the authenticated reviewer
    if (purchaseRow.buyer_id !== reviewerUserId) return false;

    // 3. Purchase must be active
    if (!purchaseRow.active) return false;

    // 4. Purchase must have started and not expired (server time)
    const serverNow = new Date();
    const startedAt = new Date(purchaseRow.started_at);
    const expiresAt = new Date(purchaseRow.expires_at);
    if (serverNow < startedAt || serverNow >= expiresAt) return false;

    // 5. Purchase vendor EAGOH must equal the entry's EAGOH
    if (purchaseRow.eagoh_id !== entryEagohId) return false;

    // 6. Entry owner must equal the verified vendor
    if (purchaseRow.vendor_id !== entryOwnerId) return false;

    // 7. Verify the listing still references the same vendor and EAGOH
    const { data: listing } = await serviceClient
      .from("marketplace_listings")
      .select("vendor_id, eagoh_id, active")
      .eq("vendor_id", purchaseRow.vendor_id)
      .eq("eagoh_id", purchaseRow.eagoh_id)
      .maybeSingle();

    if (listing) {
      const listingRow = listing as {
        vendor_id: string; eagoh_id: string; active: boolean;
      };
      if (!listingRow.active) return false;
      if (listingRow.vendor_id !== purchaseRow.vendor_id) return false;
      if (listingRow.eagoh_id !== purchaseRow.eagoh_id) return false;
    }

    return true;
  }

  return false;
}

/**
 * Check and update daily rate limits. Returns false if limit exceeded.
 */
async function checkAndUpdateRateLimits(
  serviceClient: SupabaseClient,
  userId: string,
  type: "feedback" | "dispute",
): Promise<boolean> {
  const maxDaily = type === "feedback" ? MAX_DAILY_FEEDBACK : MAX_DAILY_DISPUTES;
  const now = new Date().toISOString();

  // The live table uses one row per user (user_id as primary key)
  // with daily_feedback_count / daily_dispute_count for per-day limits
  // and feedback_count / dispute_count for total counts.
  const { data: existing } = await serviceClient
    .from("feedback_rate_limits")
    .select("feedback_count, dispute_count, daily_feedback_count, daily_dispute_count, window_started_at, last_feedback_at, last_dispute_at")
    .eq("user_id", userId)
    .maybeSingle();

  // Determine if the daily window should reset (compare window_started_at to today)
  const todayStart = new Date().toISOString().slice(0, 10) + "T00:00:00Z";

  if (existing) {
    const row = existing as {
      feedback_count: number; dispute_count: number;
      daily_feedback_count: number; daily_dispute_count: number;
      window_started_at: string | null; last_feedback_at: string | null; last_dispute_at: string | null;
    };

    // Reset daily counters if the window started on a previous day
    const windowDate = row.window_started_at ? new Date(row.window_started_at).toISOString().slice(0, 10) : null;
    const isNewDay = windowDate !== todayStart.slice(0, 10);

    const dailyCount = type === "feedback"
      ? (isNewDay ? 0 : row.daily_feedback_count)
      : (isNewDay ? 0 : row.daily_dispute_count);

    if (dailyCount >= maxDaily) return false;

    const updateFields: Record<string, unknown> = {
      updated_at: now,
      window_started_at: isNewDay ? todayStart : row.window_started_at,
    };

    if (isNewDay) {
      updateFields.daily_feedback_count = type === "feedback" ? 1 : 0;
      updateFields.daily_dispute_count = type === "dispute" ? 1 : 0;
    } else {
      updateFields.daily_feedback_count = type === "feedback" ? row.daily_feedback_count + 1 : row.daily_feedback_count;
      updateFields.daily_dispute_count = type === "dispute" ? row.daily_dispute_count + 1 : row.daily_dispute_count;
    }

    updateFields.feedback_count = type === "feedback" ? row.feedback_count + 1 : row.feedback_count;
    updateFields.dispute_count = type === "dispute" ? row.dispute_count + 1 : row.dispute_count;

    if (type === "feedback") updateFields.last_feedback_at = now;
    else updateFields.last_dispute_at = now;

    await serviceClient
      .from("feedback_rate_limits")
      .update(updateFields)
      .eq("user_id", userId);
  } else {
    await serviceClient
      .from("feedback_rate_limits")
      .insert({
        user_id: userId,
        feedback_count: type === "feedback" ? 1 : 0,
        dispute_count: type === "dispute" ? 1 : 0,
        daily_feedback_count: type === "feedback" ? 1 : 0,
        daily_dispute_count: type === "dispute" ? 1 : 0,
        window_started_at: todayStart,
        last_feedback_at: type === "feedback" ? now : null,
        last_dispute_at: type === "dispute" ? now : null,
      });
  }

  return true;
}

/**
 * Basic anomaly detection for feedback gaming.
 * Flags: rapid bursts, targeting same user repeatedly, reciprocal patterns.
 */
async function detectFeedbackAnomaly(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<boolean> {
  // Check if user submitted >10 feedback in the last hour (burst)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentFeedback } = await serviceClient
    .from("open_intelligence_feedback")
    .select("id")
    .eq("reviewer_user_id", userId)
    .gte("created_at", oneHourAgo);

  if (recentFeedback && recentFeedback.length > 10) return true;

  // Check if user is targeting the same contributor repeatedly (>5 feedback to one person today)
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayFeedback } = await serviceClient
    .from("open_intelligence_feedback")
    .select("entry_id")
    .eq("reviewer_user_id", userId)
    .gte("created_at", today + "T00:00:00Z");

  if (todayFeedback && todayFeedback.length > 0) {
    // Get entry owners
    const entryIds = todayFeedback.map((f) => (f as { entry_id: string }).entry_id);
    const { data: entries } = await serviceClient
      .from("open_intelligence")
      .select("user_id")
      .in("id", entryIds);

    if (entries) {
      const ownerCount = new Map<string, number>();
      for (const e of entries as Array<{ user_id: string }>) {
        ownerCount.set(e.user_id, (ownerCount.get(e.user_id) ?? 0) + 1);
      }
      for (const count of ownerCount.values()) {
        if (count > 5) return true;
      }
    }
  }

  return false;
}

// ── Phase 5B: Dispute Submission Handler ──────────────────────────────────────

async function handleSubmitDispute(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  let payload: {
    entryId: string;
    reasonCategory: string;
    explanation: string;
    supportingUrl?: string;
    accessSource: string;
    factionId?: string;
    exchangePurchaseId?: string;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request." }, 400);
  }

  const validCategories = [
    "incorrect", "misleading", "outdated", "needs_context",
    "fabricated", "abusive", "prohibited", "other",
  ];
  if (!validCategories.includes(payload.reasonCategory)) {
    return jsonResponse({ ok: false, error: "Invalid reason category." }, 400);
  }

  if (!ACCESS_SOURCES.includes(payload.accessSource as (typeof ACCESS_SOURCES)[number])) {
    return jsonResponse({ ok: false, error: "Invalid access source." }, 400);
  }

  if (!payload.explanation?.trim() || payload.explanation.trim().length < 10) {
    return jsonResponse({ ok: false, error: "Explanation must be at least 10 characters." }, 400);
  }
  if (payload.explanation.trim().length > 1000) {
    return jsonResponse({ ok: false, error: "Explanation must be 1000 characters or fewer." }, 400);
  }
  // Validate supporting URL format if provided
  if (payload.supportingUrl && payload.supportingUrl.trim()) {
    if (!isValidHttpUrl(payload.supportingUrl.trim())) {
      return jsonResponse({ ok: false, error: "Supporting URL must be a valid HTTP or HTTPS URL." }, 400);
    }
  }

  // Authenticate
  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  const serviceClient = getServiceRoleClient(env);
  if (!serviceClient) {
    return jsonResponse({ ok: false, error: "Server configuration error." }, 503);
  }

  // Fetch entry with status and sharing flags for eligibility verification
  const { data: entry, error: entryErr } = await serviceClient
    .from("open_intelligence")
    .select("id, user_id, validation_status, eagoh_id, exchange_share_enabled")
    .eq("id", payload.entryId)
    .maybeSingle();

  if (entryErr || !entry) {
    return jsonResponse({ ok: false, error: "Entry not found." }, 404);
  }

  const entryRow = entry as {
    id: string; user_id: string; validation_status: string;
    eagoh_id: string; exchange_share_enabled: boolean;
  };

  // Prevent self-dispute
  if (entryRow.user_id === userId) {
    return jsonResponse({ ok: false, error: "Cannot dispute your own entry." }, 403);
  }

  // Block disputes on rejected or withdrawn entries
  if (EXCLUDED_STATUSES.includes(entryRow.validation_status as (typeof EXCLUDED_STATUSES)[number])) {
    return jsonResponse({ ok: false, error: "Disputes are not available for rejected or withdrawn entries." }, 403);
  }

  // Verify access eligibility — require explicit access source from client
  const canAccess = await verifyFeedbackEligibility(
    serviceClient, userId, entryRow.user_id, payload.entryId,
    entryRow.eagoh_id, entryRow.exchange_share_enabled,
    payload.accessSource, payload.factionId, payload.exchangePurchaseId,
  );
  if (!canAccess) {
    return jsonResponse({ ok: false, error: "You do not have authorized access to this intelligence." }, 403);
  }

  // Rate limit
  const rateLimitOk = await checkAndUpdateRateLimits(serviceClient, userId, "dispute");
  if (!rateLimitOk) {
    return jsonResponse({ ok: false, error: "Daily dispute limit reached." }, 429);
  }

  // Insert dispute (unique constraint prevents duplicate disputes by same user)
  const { error: insertErr } = await serviceClient
    .from("open_intelligence_disputes")
    .insert({
      entry_id: payload.entryId,
      reporter_user_id: userId,
      reason_category: payload.reasonCategory,
      explanation: payload.explanation.trim(),
      supporting_url: payload.supportingUrl ?? null,
      access_source: payload.accessSource,
      faction_id: payload.factionId ?? null,
      exchange_purchase_id: payload.exchangePurchaseId ?? null,
      status: "pending",
    });

  if (insertErr) {
    if (insertErr.message.includes("duplicate") || insertErr.message.includes("unique")) {
      return jsonResponse({ ok: false, error: "You have already disputed this entry." }, 409);
    }
    console.warn("[dispute] insert failed", insertErr.message);
    return jsonResponse({ ok: false, error: "Failed to submit dispute." }, 500);
  }

  // Update entry's active dispute count and set validation_status to 'disputed' if pending
  const disputeCountResult = await serviceClient
    .from("open_intelligence_disputes")
    .select("id", { count: "exact", head: true })
    .eq("entry_id", payload.entryId)
    .in("status", ["pending", "reviewing", "upheld"]);
  await serviceClient
    .from("open_intelligence")
    .update({
      active_dispute_count: disputeCountResult.count ?? 1,
    })
    .eq("id", payload.entryId);

  // If entry was pending_review, mark it as disputed
  await serviceClient
    .from("open_intelligence")
    .update({ validation_status: "disputed" })
    .eq("id", payload.entryId)
    .eq("validation_status", "pending_review");

  // Recalculate contributor reputation
  try {
    await serviceClient.rpc("recalculate_contributor_reputation", { p_user_id: entryRow.user_id });
  } catch (e) {
    console.warn("[dispute] reputation recalc failed", e instanceof Error ? e.message : "unknown");
  }

  return jsonResponse({ ok: true });
}

// ── Phase 5B: Reputation Fetch Handler ───────────────────────────────────────

async function handleGetReputation(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId") ?? userId;

  // If requesting own reputation, use service_role to return full details.
  // If requesting another user's reputation, return only safe public fields
  // via the public_contributor_reputation view (overall_score only).
  const isSelf = targetUserId === userId;

  if (isSelf) {
    const serviceClient = getServiceRoleClient(env);
    if (serviceClient) {
      const { data: selfData, error: selfErr } = await serviceClient
        .from("intelligence_contributor_reputation")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (selfErr) {
        return jsonResponse({ ok: false, error: "Failed to fetch reputation." }, 500);
      }

      if (!selfData) {
        return jsonResponse({
          ok: true,
          reputation: {
            user_id: targetUserId,
            overall_score: 50,
            quality_component: 50,
            usefulness_component: 50,
            validation_component: 50,
            reliability_component: 50,
            dispute_penalty: 0,
            total_entries: 0,
            entries_used: 0,
            supported_entries: 0,
            disputed_entries: 0,
            rejected_entries: 0,
            withdrawn_entries: 0,
          },
        });
      }

      return jsonResponse({ ok: true, reputation: selfData });
    }
  }

  // Other users: return only safe public fields via the view
  const { data, error } = await supabase
    .from("public_contributor_reputation")
    .select("user_id, overall_score, calculated_at")
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (error) {
    return jsonResponse({ ok: false, error: "Failed to fetch reputation." }, 500);
  }

  if (!data) {
    // Return neutral defaults for new users
    return jsonResponse({
      ok: true,
      reputation: {
        user_id: targetUserId,
        overall_score: 50,
        calculated_at: null,
      },
    });
  }

  return jsonResponse({ ok: true, reputation: data });
}

// ── Phase 5B: Quality Evaluation Handler ─────────────────────────────────────

async function handleEvaluateQuality(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  let payload: { entryId: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request." }, 400);
  }

  const serviceClient = getServiceRoleClient(env);
  if (!serviceClient) {
    return jsonResponse({ ok: false, error: "Server configuration error." }, 503);
  }

  // Fetch entry — only the owner can request quality evaluation
  const { data: entry, error } = await serviceClient
    .from("open_intelligence")
    .select("id, user_id, content, entry_type, selected_category, selected_subtags, custom_tags, confidence_level, quality_score, validation_status, content_hash, duplicate_flag")
    .eq("id", payload.entryId)
    .maybeSingle();

  if (error || !entry) {
    return jsonResponse({ ok: false, error: "Entry not found." }, 404);
  }

  const entryRow = entry as {
    id: string; user_id: string; content: string; entry_type: string; selected_category: string | null;
    selected_subtags: string[] | null; custom_tags: string[] | null;
    confidence_level: string; quality_score: number; validation_status: string;
    content_hash: string | null; duplicate_flag: boolean;
  };

  if (entryRow.user_id !== userId) {
    return jsonResponse({ ok: false, error: "Only the entry owner can request quality evaluation." }, 403);
  }

  // Evaluate quality with full spec signature
  const newQuality = evaluateOpenIntelligenceQuality({
    content: entryRow.content,
    entryType: entryRow.entry_type,
    category: entryRow.selected_category,
    subtags: entryRow.selected_subtags,
    customTags: entryRow.custom_tags,
    confidenceLevel: entryRow.confidence_level,
    userId,
  });

  // Compute server-authoritative influence baseline
  const newInfluence = computeInfluenceBaseline(newQuality, entryRow.confidence_level, entryRow.entry_type);

  // Check for duplicates among the user's other entries
  const { data: otherEntries } = await serviceClient
    .from("open_intelligence")
    .select("id, content, content_hash")
    .eq("user_id", userId)
    .neq("id", payload.entryId)
    .limit(100);

  const newHash = contentHash(entryRow.content);
  const duplicateOf = otherEntries
    ? findDuplicate(otherEntries as Array<{ id: string; content: string; content_hash: string | null }>, entryRow.content, newHash)
    : null;

  // Update entry with server-authoritative quality, influence, content hash, and duplicate flag
  await serviceClient
    .from("open_intelligence")
    .update({
      quality_score: newQuality,
      influence_score: newInfluence,
      content_hash: newHash,
      duplicate_flag: duplicateOf !== null,
      duplicate_of: duplicateOf,
    })
    .eq("id", payload.entryId);

  return jsonResponse({
    ok: true,
    qualityScore: newQuality,
    influenceScore: newInfluence,
    duplicateDetected: duplicateOf !== null,
    duplicateOf: duplicateOf,
  });
}

// ── Phase 5B: OI Update Handler (version history + dispute preservation) ─────

async function handleUpdateOIEntry(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  let payload: {
    entryId: string;
    content?: string;
    confidenceLevel?: string;
    selectedCategory?: string | null;
    selectedSubtags?: string[] | null;
    customTags?: string[] | null;
    exchangeShareEnabled?: boolean;
  };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request." }, 400);
  }

  // Authenticate
  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  const serviceClient = getServiceRoleClient(env);
  if (!serviceClient) {
    return jsonResponse({ ok: false, error: "Server configuration error." }, 503);
  }

  // 1. Fetch the entry — verify ownership
  const { data: entry, error: entryErr } = await serviceClient
    .from("open_intelligence")
    .select("id, user_id, content, confidence_level, selected_category, selected_subtags, custom_tags, exchange_share_enabled, validation_status, version_number, active_dispute_count, quality_score, influence_score")
    .eq("id", payload.entryId)
    .maybeSingle();

  if (entryErr || !entry) {
    return jsonResponse({ ok: false, error: "Entry not found." }, 404);
  }

  const entryRow = entry as {
    id: string; user_id: string; content: string; confidence_level: string;
    selected_category: string | null; selected_subtags: string[] | null;
    custom_tags: string[] | null; exchange_share_enabled: boolean;
    validation_status: string; version_number: number; active_dispute_count: number;
    quality_score: number; influence_score: number;
  };

  if (entryRow.user_id !== userId) {
    return jsonResponse({ ok: false, error: "Only the entry owner can update this entry." }, 403);
  }

  // 2. Determine if this is a major edit (content changed) vs minor (tags/settings only)
  const newContent = payload.content?.trim() ?? entryRow.content;
  const isMajorEdit = payload.content !== undefined && newContent !== entryRow.content;

  // 3. Save version history BEFORE updating the active entry
  const currentVersion = entryRow.version_number ?? 1;
  // All user-initiated edits use change_type = 'edit' (never minor_edit/major_edit).
  // isMajorEdit only controls whether version_number is incremented and reputation
  // is recalculated downstream — it does not change the change_type value.
  const { error: versionErr } = await serviceClient
    .from("open_intelligence_versions")
    .insert({
      entry_id: payload.entryId,
      version_number: currentVersion,
      previous_content: entryRow.content,
      previous_category: entryRow.selected_category,
      previous_subtags: entryRow.selected_subtags ?? [],
      previous_custom_tags: entryRow.custom_tags ?? [],
      previous_confidence_level: entryRow.confidence_level,
      previous_validation_status: entryRow.validation_status,
      previous_quality_score: entryRow.quality_score,
      previous_influence_score: entryRow.influence_score,
      change_type: "edit",
      changed_by: userId,
    });

  if (versionErr) {
    console.warn("[oi-update] version history insert failed", versionErr.message);
    // Non-fatal — proceed with update
  }

  // 4. Build update object — only allow client to set user-editable fields.
  //    quality_score, influence_score, content_hash, duplicate_flag are
  //    overwritten by the DB trigger (evaluate_oi_quality_trigger).
  //    validation_status is preserved unless the entry is rejected/withdrawn.
  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.content !== undefined) {
    // Input validation: reject excessively long content (match client 5000 char limit)
    const trimmedContent = newContent.slice(0, 5000);
    updateFields.content = trimmedContent;
    updateFields.character_count_no_spaces = trimmedContent.replace(/\s/g, "").length;
  }
  if (payload.confidenceLevel !== undefined) {
    updateFields.confidence_level = payload.confidenceLevel;
  }
  if (payload.selectedCategory !== undefined) {
    updateFields.selected_category = payload.selectedCategory;
  }
  if (payload.selectedSubtags !== undefined) {
    updateFields.selected_subtags = payload.selectedSubtags;
  }
  if (payload.customTags !== undefined) {
    updateFields.custom_tags = payload.customTags;
  }
  if (payload.exchangeShareEnabled !== undefined) {
    updateFields.exchange_share_enabled = payload.exchangeShareEnabled;
  }

  // Major content edit: increment version and mark for reevaluation.
  // Do NOT reset dispute history — disputes survive edits.
  if (isMajorEdit) {
    updateFields.version_number = currentVersion + 1;
    // If entry was pending_review, keep it pending (needs reevaluation).
    // If it was community_supported or externally_supported, keep the status
    // but mark for reevaluation. Disputed entries stay disputed.
  }

  // 5. Update the entry — the DB trigger overwrites quality/influence/hash/duplicate
  const { data: updated, error: updateErr } = await serviceClient
    .from("open_intelligence")
    .update(updateFields)
    .eq("id", payload.entryId)
    .select("id, quality_score, influence_score, content_hash, duplicate_flag, version_number")
    .single();

  if (updateErr) {
    console.warn("[oi-update] update failed", updateErr.message);
    return jsonResponse({ ok: false, error: "Failed to update entry." }, 500);
  }

  const updatedRow = updated as {
    id: string; quality_score: number; influence_score: number;
    content_hash: string | null; duplicate_flag: boolean; version_number: number;
  };

  // 6. Best-effort: recalculate contributor reputation after a major edit
  if (isMajorEdit) {
    try {
      await serviceClient.rpc("recalculate_contributor_reputation", { p_user_id: userId });
    } catch (e) {
      console.warn("[oi-update] reputation recalc failed", e instanceof Error ? e.message : "unknown");
    }
  }

  return jsonResponse({
    ok: true,
    entry: {
      id: updatedRow.id,
      qualityScore: updatedRow.quality_score,
      influenceScore: updatedRow.influence_score,
      contentHash: updatedRow.content_hash,
      duplicateFlag: updatedRow.duplicate_flag,
      versionNumber: updatedRow.version_number,
    },
  });
}

// ── Phase 6B: Withdraw Entry ────────────────────────────────────────────────

async function handleWithdrawOIEntry(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  let payload: { entryId: string };
  try {
    payload = (await request.json()) as { entryId: string };
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request." }, 400);
  }
  if (!payload.entryId) {
    return jsonResponse({ ok: false, error: "Entry ID required." }, 400);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  const serviceClient = getServiceRoleClient(env);
  if (!serviceClient) return jsonResponse({ ok: false, error: "Server configuration error." }, 503);

  // Verify ownership
  const { data: entry, error: entryErr } = await serviceClient
    .from("open_intelligence")
    .select("id, user_id, content, confidence_level, selected_category, selected_subtags, custom_tags, exchange_share_enabled, validation_status, version_number, quality_score, influence_score")
    .eq("id", payload.entryId)
    .maybeSingle();

  if (entryErr || !entry) {
    return jsonResponse({ ok: false, error: "Entry not found." }, 404);
  }

  const entryRow = entry as {
    id: string; user_id: string; content: string; confidence_level: string;
    selected_category: string | null; selected_subtags: string[] | null;
    custom_tags: string[] | null; exchange_share_enabled: boolean;
    validation_status: string; version_number: number;
    quality_score: number; influence_score: number;
  };

  if (entryRow.user_id !== userId) {
    return jsonResponse({ ok: false, error: "Only the entry owner can withdraw this entry." }, 403);
  }

  // Already withdrawn or rejected — cannot withdraw again
  if (entryRow.validation_status === "withdrawn") {
    return jsonResponse({ ok: false, error: "Entry is already withdrawn." }, 409);
  }
  if (entryRow.validation_status === "rejected") {
    return jsonResponse({ ok: false, error: "Cannot withdraw a rejected entry." }, 403);
  }

  // Save version history before withdrawing
  const currentVersion = entryRow.version_number ?? 1;
  await serviceClient
    .from("open_intelligence_versions")
    .insert({
      entry_id: payload.entryId,
      version_number: currentVersion,
      previous_content: entryRow.content,
      previous_category: entryRow.selected_category,
      previous_subtags: entryRow.selected_subtags ?? [],
      previous_custom_tags: entryRow.custom_tags ?? [],
      previous_confidence_level: entryRow.confidence_level,
      previous_validation_status: entryRow.validation_status,
      previous_quality_score: entryRow.quality_score,
      previous_influence_score: entryRow.influence_score,
      change_type: "withdrawal",
      changed_by: userId,
    });

  // Set status to withdrawn, disable all sharing
  await serviceClient
    .from("open_intelligence")
    .update({
      validation_status: "withdrawn",
      exchange_share_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.entryId);

  // Remove all faction sharing links for this entry
  await serviceClient
    .from("faction_shared_intelligence")
    .delete()
    .eq("oi_entry_id", payload.entryId);

  // Recalculate contributor reputation
  try {
    await serviceClient.rpc("recalculate_contributor_reputation", { p_user_id: userId });
  } catch (e) {
    console.warn("[oi-withdraw] reputation recalc failed", e instanceof Error ? e.message : "unknown");
  }

  // Phase 6C: notify owner about sharing removal due to withdrawal
  await createIntelligenceNotification(serviceClient, userId, payload.entryId, "exchange_sharing_disabled");
  await createIntelligenceNotification(serviceClient, userId, payload.entryId, "faction_sharing_removed");

  return jsonResponse({ ok: true });
}

// ── Phase 6B: Restore Entry ─────────────────────────────────────────────────

async function handleRestoreOIEntry(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  let payload: { entryId: string };
  try {
    payload = (await request.json()) as { entryId: string };
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request." }, 400);
  }
  if (!payload.entryId) {
    return jsonResponse({ ok: false, error: "Entry ID required." }, 400);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  const serviceClient = getServiceRoleClient(env);
  if (!serviceClient) return jsonResponse({ ok: false, error: "Server configuration error." }, 503);

  // Verify ownership
  const { data: entry, error: entryErr } = await serviceClient
    .from("open_intelligence")
    .select("id, user_id, content, confidence_level, selected_category, selected_subtags, custom_tags, validation_status, version_number, quality_score, influence_score")
    .eq("id", payload.entryId)
    .maybeSingle();

  if (entryErr || !entry) {
    return jsonResponse({ ok: false, error: "Entry not found." }, 404);
  }

  const entryRow = entry as {
    id: string; user_id: string; content: string; confidence_level: string;
    selected_category: string | null; selected_subtags: string[] | null;
    custom_tags: string[] | null; validation_status: string;
    version_number: number; quality_score: number; influence_score: number;
  };

  if (entryRow.user_id !== userId) {
    return jsonResponse({ ok: false, error: "Only the entry owner can restore this entry." }, 403);
  }

  if (entryRow.validation_status !== "withdrawn") {
    return jsonResponse({ ok: false, error: "Only withdrawn entries can be restored." }, 409);
  }

  // Save version history before restoring
  const currentVersion = entryRow.version_number ?? 1;
  await serviceClient
    .from("open_intelligence_versions")
    .insert({
      entry_id: payload.entryId,
      version_number: currentVersion,
      previous_content: entryRow.content,
      previous_category: entryRow.selected_category,
      previous_subtags: entryRow.selected_subtags ?? [],
      previous_custom_tags: entryRow.custom_tags ?? [],
      previous_confidence_level: entryRow.confidence_level,
      previous_validation_status: entryRow.validation_status,
      previous_quality_score: entryRow.quality_score,
      previous_influence_score: entryRow.influence_score,
      change_type: "restoration",
      changed_by: userId,
    });

  // Restore to pending_review — do NOT re-enable any sharing
  await serviceClient
    .from("open_intelligence")
    .update({
      validation_status: "pending_review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.entryId);

  // Recalculate contributor reputation
  try {
    await serviceClient.rpc("recalculate_contributor_reputation", { p_user_id: userId });
  } catch (e) {
    console.warn("[oi-restore] reputation recalc failed", e instanceof Error ? e.message : "unknown");
  }

  return jsonResponse({ ok: true });
}

// ── Phase 6B: Toggle Faction Sharing ────────────────────────────────────────

async function handleToggleFactionShare(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  let payload: { entryId: string; factionId: string; enabled: boolean };
  try {
    payload = (await request.json()) as { entryId: string; factionId: string; enabled: boolean };
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request." }, 400);
  }
  if (!payload.entryId || !payload.factionId) {
    return jsonResponse({ ok: false, error: "Entry ID and Faction ID required." }, 400);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  const serviceClient = getServiceRoleClient(env);
  if (!serviceClient) return jsonResponse({ ok: false, error: "Server configuration error." }, 503);

  // Verify ownership
  const { data: entry, error: entryErr } = await serviceClient
    .from("open_intelligence")
    .select("id, user_id, validation_status")
    .eq("id", payload.entryId)
    .maybeSingle();

  if (entryErr || !entry) {
    return jsonResponse({ ok: false, error: "Entry not found." }, 404);
  }

  const entryRow = entry as { id: string; user_id: string; validation_status: string };

  if (entryRow.user_id !== userId) {
    return jsonResponse({ ok: false, error: "Only the entry owner can manage sharing." }, 403);
  }

  // Cannot share rejected or withdrawn entries
  if (entryRow.validation_status === "rejected" || entryRow.validation_status === "withdrawn") {
    return jsonResponse({ ok: false, error: "Cannot share rejected or withdrawn entries." }, 403);
  }

  if (payload.enabled) {
    // Check if already shared with this faction
    const { data: existing } = await serviceClient
      .from("faction_shared_intelligence")
      .select("id")
      .eq("oi_entry_id", payload.entryId)
      .eq("faction_id", payload.factionId)
      .maybeSingle();

    if (!existing) {
      await serviceClient
        .from("faction_shared_intelligence")
        .insert({
          faction_id: payload.factionId,
          user_id: userId,
          oi_entry_id: payload.entryId,
        });
    }
  } else {
    // Remove sharing — owner can always unshare their own entry
    await serviceClient
      .from("faction_shared_intelligence")
      .delete()
      .eq("oi_entry_id", payload.entryId)
      .eq("faction_id", payload.factionId);
  }

  return jsonResponse({ ok: true });
}

// ── Phase 6B: Version History ───────────────────────────────────────────────

async function handleGetVersionHistory(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  const serviceClient = getServiceRoleClient(env);
  if (!serviceClient) return jsonResponse({ ok: false, error: "Server configuration error." }, 503);

  const url = new URL(request.url);
  const entryId = url.searchParams.get("entryId");
  if (!entryId) {
    return jsonResponse({ ok: false, error: "Entry ID required." }, 400);
  }

  // Verify ownership — only the owner can see version history
  const { data: entry } = await serviceClient
    .from("open_intelligence")
    .select("id, user_id")
    .eq("id", entryId)
    .maybeSingle();

  const entryRow = entry as { id: string; user_id: string } | null;
  if (!entryRow || entryRow.user_id !== userId) {
    return jsonResponse({ ok: false, error: "Only the entry owner can view version history." }, 403);
  }

  const { data: versions, error: versionsErr } = await serviceClient
    .from("open_intelligence_versions")
    .select("id, entry_id, version_number, previous_content, previous_category, previous_subtags, previous_custom_tags, previous_confidence_level, previous_validation_status, previous_quality_score, previous_influence_score, change_type, changed_by, changed_at")
    .eq("entry_id", entryId)
    .order("version_number", { ascending: false })
    .limit(50);

  if (versionsErr) {
    return jsonResponse({ ok: false, error: "Failed to fetch version history." }, 500);
  }

  return jsonResponse({ ok: true, versions: versions ?? [] });
}

// ── Phase 6C: Intelligence Notifications & Audit ───────────────────────────

/** Notification type → title and message template. Reporter identity is never included. */
const NOTIFICATION_TEMPLATES: Record<
  string,
  { title: string; message: string }
> = {
  community_supported: {
    title: "Community Supported",
    message: "Your intelligence entry received community support.",
  },
  externally_supported: {
    title: "Externally Supported",
    message: "Your intelligence entry was supported by external evidence.",
  },
  disputed: {
    title: "Entry Disputed",
    message:
      "Your intelligence entry has been marked disputed and may receive reduced influence.",
  },
  rejected: {
    title: "Entry Rejected",
    message:
      "Your intelligence entry was rejected and removed from analyst, Faction, and Exchange use.",
  },
  dispute_dismissed: {
    title: "Dispute Dismissed",
    message: "A dispute involving your intelligence entry was dismissed.",
  },
  outdated: {
    title: "Entry Outdated",
    message: "Your intelligence entry has been automatically marked outdated.",
  },
  exchange_sharing_disabled: {
    title: "Exchange Sharing Disabled",
    message:
      "Exchange sharing was disabled because of your entry's status.",
  },
  faction_sharing_removed: {
    title: "Faction Sharing Removed",
    message:
      "Faction sharing was removed because of your entry's status.",
  },
};

/** Create a notification for the entry owner. Reporter identity is never included.
 *  Notification failures are logged but do NOT undo a successful moderation action. */
async function createIntelligenceNotification(
  serviceClient: SupabaseClient,
  userId: string,
  entryId: string,
  notificationType: string,
): Promise<void> {
  const template = NOTIFICATION_TEMPLATES[notificationType];
  if (!template) {
    console.warn(`[notifications] unknown type: ${notificationType}`);
    return;
  }
  try {
    await serviceClient.from("intelligence_notifications").insert({
      user_id: userId,
      entry_id: entryId,
      notification_type: notificationType,
      title: template.title,
      message: template.message,
      is_read: false,
    });
  } catch (e) {
    // Log but do not throw — notification failure must not undo moderation
    console.warn(
      `[notifications] insert failed for ${notificationType}:`,
      e instanceof Error ? e.message : "unknown",
    );
  }
}

/** Save a moderation audit record. Only called by verified admins via the secure worker. */
async function createModerationAuditRecord(
  serviceClient: SupabaseClient,
  entryId: string,
  moderatorUserId: string,
  action: string,
  previousStatus: string,
  newStatus: string,
  disputeId?: string,
  note?: string,
): Promise<void> {
  try {
    await serviceClient.from("intelligence_moderation_audit").insert({
      entry_id: entryId,
      moderator_user_id: moderatorUserId,
      action,
      previous_status: previousStatus,
      new_status: newStatus,
      dispute_id: disputeId ?? null,
      optional_note: note ?? null,
    });
  } catch (e) {
    console.warn(
      `[audit] insert failed for ${action}:`,
      e instanceof Error ? e.message : "unknown",
    );
  }
}

// ── Phase 6B: Moderation Queue (admin only) ─────────────────────────────────

// Phase 6B: Admin access via explicit is_admin flag. Subscription tiers are NOT sufficient.
// Only profiles with is_admin = true can access moderation endpoints.
async function isAdmin(serviceClient: SupabaseClient, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("is_admin, admin_tier_override, admin_tier_expires_at")
    .eq("id", userId)
    .maybeSingle();

  const p = profile as { is_admin: boolean | null; admin_tier_override: string | null; admin_tier_expires_at: string | null } | null;
  if (!p || !p.is_admin) return false;
  if (p.admin_tier_expires_at) {
    const expires = new Date(p.admin_tier_expires_at).getTime();
    if (Date.now() > expires) return false;
  }
  return true;
}

async function handleGetModerationQueue(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  const serviceClient = getServiceRoleClient(env);
  if (!serviceClient) return jsonResponse({ ok: false, error: "Server configuration error." }, 503);

  const admin = await isAdmin(serviceClient, userId);
  if (!admin) {
    return jsonResponse({ ok: false, error: "Moderation access required." }, 403);
  }

  // Fetch disputed entries with active disputes
  const { data: disputedEntries, error: disputeErr } = await serviceClient
    .from("open_intelligence")
    .select("id, content, validation_status, user_id, eagoh_id, quality_score, active_dispute_count, created_at, updated_at")
    .in("validation_status", ["disputed", "pending_review"])
    .order("updated_at", { ascending: false })
    .limit(50);

  if (disputeErr) {
    return jsonResponse({ ok: false, error: "Failed to fetch moderation queue." }, 500);
  }

  const entries = (disputedEntries ?? []) as {
    id: string; content: string; validation_status: string; user_id: string;
    eagoh_id: string; quality_score: number; active_dispute_count: number;
    created_at: string; updated_at: string;
  }[];

  // For each entry, fetch its disputes (without reporter identity)
  const queueItems: ModerationQueueItem[] = [];
  for (const entry of entries) {
    const { data: disputes } = await serviceClient
      .from("open_intelligence_disputes")
      .select("id, reason_category, explanation, supporting_url, status, created_at")
      .eq("entry_id", entry.id)
      .in("status", ["pending", "reviewing"])
      .order("created_at", { ascending: false });

    const disputeRows = (disputes ?? []) as {
      id: string; reason_category: string; explanation: string;
      supporting_url: string | null; status: string; created_at: string;
    }[];

    if (disputeRows.length === 0 && entry.validation_status !== "disputed") continue;

    // Fetch contributor reputation summary (safe public fields only)
    const { data: rep } = await serviceClient
      .from("intelligence_contributor_reputation")
      .select("overall_score")
      .eq("user_id", entry.user_id)
      .maybeSingle();
    const repRow = rep as { overall_score: number } | null;

    queueItems.push({
      entryId: entry.id,
      contentPreview: entry.content.slice(0, 200),
      validationStatus: entry.validation_status,
      reportCount: entry.active_dispute_count ?? disputeRows.length,
      contributorReputation: repRow ? Math.round(repRow.overall_score) : null,
      disputes: disputeRows.map((d) => ({
        id: d.id,
        reasonCategory: d.reason_category,
        explanation: d.explanation,
        supportingUrl: d.supporting_url,
        status: d.status,
        createdAt: d.created_at,
      })),
    });
  }

  return jsonResponse({ ok: true, queue: queueItems });
}

type ModerationQueueItem = {
  entryId: string;
  contentPreview: string;
  validationStatus: string;
  reportCount: number;
  contributorReputation: number | null;
  disputes: {
    id: string;
    reasonCategory: string;
    explanation: string;
    supportingUrl: string | null;
    status: string;
    createdAt: string;
  }[];
};

// ── Phase 6B: Moderation Action (admin only) ────────────────────────────────

async function handleModerationAction(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  let payload: { entryId: string; action: string; disputeId?: string };
  try {
    payload = (await request.json()) as { entryId: string; action: string; disputeId?: string };
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request." }, 400);
  }

  const validActions = ["dismiss_dispute", "mark_community_supported", "mark_externally_supported", "mark_disputed", "reject_entry"];
  if (!validActions.includes(payload.action)) {
    return jsonResponse({ ok: false, error: "Invalid moderation action." }, 400);
  }
  if (!payload.entryId) {
    return jsonResponse({ ok: false, error: "Entry ID required." }, 400);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  const serviceClient = getServiceRoleClient(env);
  if (!serviceClient) return jsonResponse({ ok: false, error: "Server configuration error." }, 503);

  const admin = await isAdmin(serviceClient, userId);
  if (!admin) {
    return jsonResponse({ ok: false, error: "Moderation access required." }, 403);
  }

  // Fetch entry for version history
  const { data: entry } = await serviceClient
    .from("open_intelligence")
    .select("id, user_id, content, confidence_level, selected_category, selected_subtags, custom_tags, exchange_share_enabled, validation_status, version_number, quality_score, influence_score")
    .eq("id", payload.entryId)
    .maybeSingle();

  const entryRow = entry as {
    id: string; user_id: string; content: string; confidence_level: string;
    selected_category: string | null; selected_subtags: string[] | null;
    custom_tags: string[] | null; exchange_share_enabled: boolean;
    validation_status: string; version_number: number;
    quality_score: number; influence_score: number;
  } | null;

  if (!entryRow) {
    return jsonResponse({ ok: false, error: "Entry not found." }, 404);
  }

  // Save version history for moderation action
  const currentVersion = entryRow.version_number ?? 1;
  await serviceClient
    .from("open_intelligence_versions")
    .insert({
      entry_id: payload.entryId,
      version_number: currentVersion,
      previous_content: entryRow.content,
      previous_category: entryRow.selected_category,
      previous_subtags: entryRow.selected_subtags ?? [],
      previous_custom_tags: entryRow.custom_tags ?? [],
      previous_confidence_level: entryRow.confidence_level,
      previous_validation_status: entryRow.validation_status,
      previous_quality_score: entryRow.quality_score,
      previous_influence_score: entryRow.influence_score,
      change_type: "moderation",
      changed_by: userId,
    });

  let newStatus = entryRow.validation_status;

  switch (payload.action) {
    case "dismiss_dispute":
      // Dismiss the specific dispute, keep entry status as-is unless it was only disputed
      if (payload.disputeId) {
        await serviceClient
          .from("open_intelligence_disputes")
          .update({ status: "dismissed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
          .eq("id", payload.disputeId);
      }
      // If entry was disputed and no more active disputes remain, restore to pending_review
      if (entryRow.validation_status === "disputed") {
        const { count } = await serviceClient
          .from("open_intelligence_disputes")
          .select("id", { count: "exact", head: true })
          .eq("entry_id", payload.entryId)
          .in("status", ["pending", "reviewing", "upheld"]);
        if ((count ?? 0) === 0) {
          newStatus = "pending_review";
        }
      }
      break;

    case "mark_community_supported":
      newStatus = "community_supported";
      // Dismiss all pending disputes for this entry
      await serviceClient
        .from("open_intelligence_disputes")
        .update({ status: "dismissed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
        .eq("entry_id", payload.entryId)
        .in("status", ["pending", "reviewing"]);
      break;

    case "mark_externally_supported":
      newStatus = "externally_supported";
      await serviceClient
        .from("open_intelligence_disputes")
        .update({ status: "dismissed", reviewed_by: userId, reviewed_at: new Date().toISOString() })
        .eq("entry_id", payload.entryId)
        .in("status", ["pending", "reviewing"]);
      break;

    case "mark_disputed":
      newStatus = "disputed";
      if (payload.disputeId) {
        await serviceClient
          .from("open_intelligence_disputes")
          .update({ status: "upheld", reviewed_by: userId, reviewed_at: new Date().toISOString() })
          .eq("id", payload.disputeId);
      }
      break;

    case "reject_entry":
      newStatus = "rejected";
      // Disable all sharing
      await serviceClient
        .from("open_intelligence")
        .update({
          validation_status: "rejected",
          exchange_share_enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.entryId);
      // Remove all faction sharing
      await serviceClient
        .from("faction_shared_intelligence")
        .delete()
        .eq("oi_entry_id", payload.entryId);
      // Dismiss or uphold all disputes
      await serviceClient
        .from("open_intelligence_disputes")
        .update({ status: "resolved", reviewed_by: userId, reviewed_at: new Date().toISOString() })
        .eq("entry_id", payload.entryId)
        .in("status", ["pending", "reviewing"]);
      // Recalculate contributor reputation
      try {
        await serviceClient.rpc("recalculate_contributor_reputation", { p_user_id: entryRow.user_id });
      } catch (e) {
        console.warn("[moderation] reputation recalc failed", e instanceof Error ? e.message : "unknown");
      }
      // Phase 6C: audit record + owner notification
      await createModerationAuditRecord(
        serviceClient, payload.entryId, userId, "reject_entry",
        entryRow.validation_status, "rejected", payload.disputeId,
      );
      await createIntelligenceNotification(
        serviceClient, entryRow.user_id, payload.entryId, "rejected",
      );
      return jsonResponse({ ok: true });
  }

  // Update entry status
  if (newStatus !== entryRow.validation_status) {
    await serviceClient
      .from("open_intelligence")
      .update({
        validation_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.entryId);
  }

  // Recalculate contributor reputation
  try {
    await serviceClient.rpc("recalculate_contributor_reputation", { p_user_id: entryRow.user_id });
  } catch (e) {
    console.warn("[moderation] reputation recalc failed", e instanceof Error ? e.message : "unknown");
  }

  // Phase 6C: audit record + owner notification for non-reject actions
  await createModerationAuditRecord(
    serviceClient, payload.entryId, userId, payload.action,
    entryRow.validation_status, newStatus, payload.disputeId,
  );
  // Map action → notification type
  const notifType: Record<string, string> = {
    dismiss_dispute: "dispute_dismissed",
    mark_community_supported: "community_supported",
    mark_externally_supported: "externally_supported",
    mark_disputed: "disputed",
  };
  const nType = notifType[payload.action];
  if (nType) {
    await createIntelligenceNotification(
      serviceClient, entryRow.user_id, payload.entryId, nType,
    );
  }

  return jsonResponse({ ok: true });
}

// ── Phase 6C: Notification endpoints (user's own notifications) ───────────

type NotificationRow = {
  id: string;
  user_id: string;
  entry_id: string | null;
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

async function handleGetNotifications(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  // Fetch the user's own notifications via anon client (RLS enforces self-only)
  const { data, error } = await supabase
    .from("intelligence_notifications")
    .select("id, user_id, entry_id, notification_type, title, message, is_read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return jsonResponse({ ok: false, error: "Failed to fetch notifications." }, 500);
  }

  const notifications = (data ?? []) as NotificationRow[];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return jsonResponse({
    ok: true,
    notifications: notifications.map((n) => ({
      id: n.id,
      entryId: n.entry_id,
      notificationType: n.notification_type,
      title: n.title,
      message: n.message,
      isRead: n.is_read,
      createdAt: n.created_at,
    })),
    unreadCount,
  });
}

async function handleMarkNotificationRead(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  let payload: { notificationId: string };
  try {
    payload = (await request.json()) as { notificationId: string };
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request." }, 400);
  }
  if (!payload.notificationId) {
    return jsonResponse({ ok: false, error: "Notification ID required." }, 400);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  // RLS ensures users can only update their own notifications
  const { error } = await supabase
    .from("intelligence_notifications")
    .update({ is_read: true })
    .eq("id", payload.notificationId)
    .eq("user_id", userId);

  if (error) {
    return jsonResponse({ ok: false, error: "Failed to mark notification as read." }, 500);
  }

  return jsonResponse({ ok: true });
}

async function handleMarkAllNotificationsRead(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  // RLS ensures users can only update their own notifications
  const { error } = await supabase
    .from("intelligence_notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  if (error) {
    return jsonResponse({ ok: false, error: "Failed to mark notifications as read." }, 500);
  }

  return jsonResponse({ ok: true });
}

// ── Phase 6C: Moderation audit endpoint (admin only) ────────────────────────

type AuditRow = {
  id: string;
  entry_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  dispute_id: string | null;
  optional_note: string | null;
  created_at: string;
};

async function handleGetModerationAudit(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  const serviceClient = getServiceRoleClient(env);
  if (!serviceClient) return jsonResponse({ ok: false, error: "Server configuration error." }, 503);

  const admin = await isAdmin(serviceClient, userId);
  if (!admin) {
    return jsonResponse({ ok: false, error: "Moderation access required." }, 403);
  }

  // Fetch recent audit records via service_role (no moderator identity exposed)
  const url = new URL(request.url);
  const entryId = url.searchParams.get("entryId");

  let query = serviceClient
    .from("intelligence_moderation_audit")
    .select("id, entry_id, action, previous_status, new_status, dispute_id, optional_note, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (entryId) {
    query = query.eq("entry_id", entryId);
  }

  const { data, error } = await query;

  if (error) {
    return jsonResponse({ ok: false, error: "Failed to fetch audit records." }, 500);
  }

  const rows = (data ?? []) as AuditRow[];

  // Return safe public fields — moderator_user_id is never exposed
  return jsonResponse({
    ok: true,
    audit: rows.map((r) => ({
      id: r.id,
      entryId: r.entry_id,
      action: r.action,
      previousStatus: r.previous_status,
      newStatus: r.new_status,
      disputeId: r.dispute_id,
      note: r.optional_note,
      createdAt: r.created_at,
    })),
  });
}

// ── Phase 8A: Intelligence Analytics Handler ──────────────────────────────────

async function handleGetIntelligenceAnalytics(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, error: "Backend not configured." }, 503);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) return jsonResponse({ ok: false, error: "Authentication required." }, 401);

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await verifyAuth(supabase, jwt);
  if (!userId) return jsonResponse({ ok: false, error: "Invalid auth." }, 401);

  // Use service_role to call the owner-scoped analytics RPCs.
  // The RPCs are security_definer and scope by p_user_id = userId; we pass
  // the verified-auth userId, never a client-supplied value.
  const serviceClient = getServiceRoleClient(env);
  if (!serviceClient) return jsonResponse({ ok: false, error: "Server configuration error." }, 503);

  // ── 1. Owner intelligence summary (entry counts, averages, sharing) ────────
  const { data: summaryRaw, error: summaryErr } = await serviceClient
    .rpc("get_owner_intelligence_summary", { p_user_id: userId });
  if (summaryErr) {
    console.warn("[analytics] summary failed", summaryErr.message);
    return jsonResponse({ ok: false, error: "Failed to fetch analytics." }, 500);
  }
  const summary = (summaryRaw as any[])?.[0] ?? null;

  // ── 2. Owner reputation (safe self fields) ─────────────────────────────────
  const { data: repRaw } = await serviceClient
    .from("intelligence_contributor_reputation")
    .select("overall_score, quality_component, usefulness_component, validation_component, reliability_component, calculated_at")
    .eq("user_id", userId)
    .maybeSingle();
  const reputation = repRaw ?? {
    overall_score: 50,
    quality_component: 50,
    usefulness_component: 50,
    validation_component: 50,
    reliability_component: 50,
    calculated_at: null,
  };

  // ── 3. Owner entry performance (safe per-entry metrics) ───────────────────
  const { data: performanceRaw, error: perfErr } = await serviceClient
    .rpc("get_owner_entry_performance", { p_user_id: userId, p_limit: 100 });
  if (perfErr) console.warn("[analytics] performance failed", perfErr.message);
  const performance = (performanceRaw as any[]) ?? [];

  // ── 4. Owner weekly trend ─────────────────────────────────────────────────
  const { data: trendRaw, error: trendErr } = await serviceClient
    .rpc("get_owner_weekly_trend", { p_user_id: userId, p_weeks: 12 });
  if (trendErr) console.warn("[analytics] trend failed", trendErr.message);
  const trend = (trendRaw as any[]) ?? [];

  // ── 5. Owner faction contributions ─────────────────────────────────────────
  const { data: factionRaw, error: factionErr } = await serviceClient
    .rpc("get_owner_faction_contributions", { p_user_id: userId });
  if (factionErr) console.warn("[analytics] faction failed", factionErr.message);
  const factionContributions = (factionRaw as any[]) ?? [];

  // ── 6. Owner exchange contributions ───────────────────────────────────────
  const { data: exchangeRaw, error: exchangeErr } = await serviceClient
    .rpc("get_owner_exchange_contributions", { p_user_id: userId });
  if (exchangeErr) console.warn("[analytics] exchange failed", exchangeErr.message);
  const exchangeContributions = (exchangeRaw as any[])?.[0] ?? {
    eligible_exchange_entries: 0,
    synchronized_entries_used: 0,
    avg_shared_quality: 0,
    supported_entry_rate: 0,
    dispute_rate: 0,
    active_purchases: 0,
    expired_purchases: 0,
  };

  return jsonResponse({
    ok: true,
    analytics: {
      summary: summary ? {
        totalEntries: Number(summary.total_entries ?? 0),
        activeEntries: Number(summary.active_entries ?? 0),
        pendingReview: Number(summary.pending_review ?? 0),
        communitySupported: Number(summary.community_supported ?? 0),
        externallySupported: Number(summary.externally_supported ?? 0),
        disputed: Number(summary.disputed ?? 0),
        withdrawn: Number(summary.withdrawn ?? 0),
        rejected: Number(summary.rejected ?? 0),
        outdated: Number(summary.outdated ?? 0),
        avgQuality: Number(summary.avg_quality ?? 0),
        avgInfluence: Number(summary.avg_influence ?? 0),
        sharedWithFaction: Number(summary.shared_with_faction ?? 0),
        sharedOnExchange: Number(summary.shared_on_exchange ?? 0),
      } : null,
      reputation: {
        overallScore: Number(reputation.overall_score ?? 50),
        qualityComponent: Number(reputation.quality_component ?? 50),
        usefulnessComponent: Number(reputation.usefulness_component ?? 50),
        validationComponent: Number(reputation.validation_component ?? 50),
        reliabilityComponent: Number(reputation.reliability_component ?? 50),
        calculatedAt: reputation.calculated_at ?? null,
      },
      entryPerformance: performance.map((p: any) => ({
        entryId: p.entry_id,
        qualityScore: Number(p.quality_score ?? 0),
        influenceScore: Number(p.influence_score ?? 0),
        validationStatus: p.validation_status,
        analystUseCount: Number(p.analyst_use_count ?? 0),
        helpfulCount: Number(p.helpful_count ?? 0),
        supportCount: Number(p.support_count ?? 0),
        disputeCount: Number(p.dispute_count ?? 0),
        outdatedFlag: Boolean(p.outdated_flag),
        lastUsedAt: p.last_used_at ?? null,
      })),
      weeklyTrend: trend.map((t: any) => ({
        weekStart: t.week_start,
        entriesCreated: Number(t.entries_created ?? 0),
        avgQuality: Number(t.avg_quality ?? 0),
        analystUses: Number(t.analyst_uses ?? 0),
        feedbackCount: Number(t.feedback_count ?? 0),
      })),
      factionContributions: factionContributions.map((f: any) => ({
        factionId: f.faction_id,
        entriesShared: Number(f.entries_shared ?? 0),
        entriesUsedByAnalysts: Number(f.entries_used_by_analysts ?? 0),
        avgQuality: Number(f.avg_quality ?? 0),
        supportedEntries: Number(f.supported_entries ?? 0),
        disputedEntries: Number(f.disputed_entries ?? 0),
      })),
      exchangeContributions: {
        eligibleExchangeEntries: Number(exchangeContributions.eligible_exchange_entries ?? 0),
        synchronizedEntriesUsed: Number(exchangeContributions.synchronized_entries_used ?? 0),
        avgSharedQuality: Number(exchangeContributions.avg_shared_quality ?? 0),
        supportedEntryRate: Number(exchangeContributions.supported_entry_rate ?? 0),
        disputeRate: Number(exchangeContributions.dispute_rate ?? 0),
        activePurchases: Number(exchangeContributions.active_purchases ?? 0),
        expiredPurchases: Number(exchangeContributions.expired_purchases ?? 0),
      },
    },
  });
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
      // Phase 5B: Fetch contributor reputations for ranking (personal entries are all owned by the same user)
      const personalRepMap = await fetchReputationsForUsers(supabase, [userId]);
      const ranked = rankEntries(rawEntries, prompt, Math.min(limit, rawEntries.length), personalRepMap);
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

  // ── Exchange Intelligence retrieval (Phase 4B hardened) ──────────────
  // Safe-failure: any Exchange error continues the session with other sources.
  let exchangeOIContext = "";
  let exchangeOICount = 0;
  let exchangeSyncCount = 0;
  let exchangeVendorEagohCount = 0;
  let rankedExchangeEntries: OpenIntelligenceRow[] = [];
  let exchangePurchaseMap: Map<string, { purchaseId: string; syncPercentage: number }> = new Map();

  // Only retrieve Exchange intelligence for paid users with service-role access
  if (isPaid) {
    const serviceClient = getServiceRoleClient(env);
    if (serviceClient) {
      console.log("[analyst:diag] service-role key present: true");

      try {
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

          console.log("[analyst:diag] final exchange count:", exchangeOICount);
        } else if (exchangeResult.syncCount > 0) {
          console.log("[analyst] Exchange OI retrieval: active syncs found but no relevant entries");
        } else {
          console.log("[analyst] Exchange OI retrieval: no active syncs");
        }
      } catch (exchangeErr) {
        // Safe failure: exchange retrieval error must NOT fail the entire analyst session.
        // Continue with Personal, Faction, and External sources only.
        const msg = exchangeErr instanceof Error ? exchangeErr.message : "unknown";
        console.warn("[analyst] Exchange OI retrieval failed safely — continuing without Exchange intelligence", {
          errorCode: "exchange_retrieval_error",
          error: msg.slice(0, 200),
        });
        // All Exchange variables remain at their zero defaults — no Exchange intelligence used
      }
    } else {
      console.log("[analyst:diag] service-role key present: false");
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
      return jsonResponse({ ok: true, now: new Date().toISOString(), service: "eagoh-analyst-worker", version: "6b-ui" });
    }

    if (url.pathname === "/analyst/chat" && request.method === "POST") {
      return handleAnalystChat(request, env);
    }

    // Phase 5B: Feedback submission
    if (url.pathname === "/feedback/submit" && request.method === "POST") {
      return handleSubmitFeedback(request, env);
    }

    // Phase 5B: Dispute submission
    if (url.pathname === "/dispute/submit" && request.method === "POST") {
      return handleSubmitDispute(request, env);
    }

    // Phase 5B: Reputation lookup
    if (url.pathname === "/reputation" && request.method === "GET") {
      return handleGetReputation(request, env);
    }

    // Phase 5B: Server-side quality evaluation
    if (url.pathname === "/quality/evaluate" && request.method === "POST") {
      return handleEvaluateQuality(request, env);
    }

    // Phase 5B: OI entry update (version history + dispute preservation)
    if (url.pathname === "/oi/update" && request.method === "POST") {
      return handleUpdateOIEntry(request, env);
    }

    // Phase 6B: OI entry withdraw
    if (url.pathname === "/oi/withdraw" && request.method === "POST") {
      return handleWithdrawOIEntry(request, env);
    }

    // Phase 6B: OI entry restore
    if (url.pathname === "/oi/restore" && request.method === "POST") {
      return handleRestoreOIEntry(request, env);
    }

    // Phase 6B: Toggle faction sharing
    if (url.pathname === "/oi/faction-share" && request.method === "POST") {
      return handleToggleFactionShare(request, env);
    }

    // Phase 6B: Version history
    if (url.pathname === "/oi/versions" && request.method === "GET") {
      return handleGetVersionHistory(request, env);
    }

    // Phase 6B: Moderation queue (admin only)
    if (url.pathname === "/moderation/queue" && request.method === "GET") {
      return handleGetModerationQueue(request, env);
    }

    // Phase 6B: Moderation action (admin only)
    if (url.pathname === "/moderation/action" && request.method === "POST") {
      return handleModerationAction(request, env);
    }

    // Phase 6C: Intelligence notifications (user's own)
    if (url.pathname === "/notifications" && request.method === "GET") {
      return handleGetNotifications(request, env);
    }

    // Phase 6C: Mark a single notification as read
    if (url.pathname === "/notifications/mark-read" && request.method === "POST") {
      return handleMarkNotificationRead(request, env);
    }

    // Phase 6C: Mark all notifications as read
    if (url.pathname === "/notifications/mark-all-read" && request.method === "POST") {
      return handleMarkAllNotificationsRead(request, env);
    }

    // Phase 6C: Moderation audit history (admin only)
    if (url.pathname === "/moderation/audit" && request.method === "GET") {
      return handleGetModerationAudit(request, env);
    }

    // Phase 8A: Intelligence analytics (owner-scoped, secure)
    if (url.pathname === "/intelligence/analytics" && request.method === "GET") {
      return handleGetIntelligenceAnalytics(request, env);
    }

    return jsonResponse({ ok: false, error: "Not found" }, 404);
  },
};
