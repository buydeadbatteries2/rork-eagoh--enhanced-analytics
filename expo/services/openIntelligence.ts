import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { spendEdge } from "@/services/edge";
import type { UserProfile } from "@/services/profile";
import type { EdgeReason } from "@/services/edge";
import { getObservationTags, getAllTagsFlat, searchTags } from "@/data/observationTags";

// ── Types ──────────────────────────────────────────────────────────────

export type EntryType = "quick_observation" | "basic_deep_entry" | "advanced_deep_entry";

export type ConfidenceLevel = "weak_suspicion" | "moderate_confidence" | "strong_confidence" | "verified_observation";

export type ValidationStatus =
  | "pending_review"
  | "validated" // legacy — migrated to community_supported server-side
  | "community_supported"
  | "externally_supported"
  | "disputed"
  | "rejected"
  | "withdrawn"
  | "flagged"; // legacy — migrated to disputed server-side

export type InfluenceScore = "low" | "medium" | "high";

export const ENTRY_TYPE_LIMITS: Record<EntryType, number> = {
  quick_observation: 110,
  basic_deep_entry: 200,
  advanced_deep_entry: 400,
};

export const ENTRY_TYPE_EDGE_COST: Record<EntryType, number> = {
  quick_observation: 10,
  basic_deep_entry: 15,
  advanced_deep_entry: 25,
};

export const CONFIDENCE_LEVELS: { id: ConfidenceLevel; label: string }[] = [
  { id: "weak_suspicion", label: "Weak Suspicion" },
  { id: "moderate_confidence", label: "Moderate Confidence" },
  { id: "strong_confidence", label: "Strong Confidence" },
  { id: "verified_observation", label: "Verified Observation" },
];

// ── Observation Tags ───────────────────────────────────────────────────

export type TagCategory = {
  id: string;
  label: string;
  tags: { id: string; label: string }[];
};

/** Sports defaults — kept for backward compatibility with sessions.tsx */
export const OBSERVATION_TAGS: TagCategory[] = getObservationTags("sports");

export const ALL_TAGS = OBSERVATION_TAGS.flatMap((cat) => cat.tags);

/**
 * Get observation tag categories for a given intelligence domain.
 * Falls back to Sports taxonomy when domain is empty or unknown.
 */
export function getTagsForDomain(domainId: string): TagCategory[] {
  return getObservationTags(domainId);
}

/**
 * Get a flat array of all tag {id, label} pairs for a given domain.
 */
export function getAllTagsForDomain(domainId: string): { id: string; label: string }[] {
  return getAllTagsFlat(domainId);
}

/**
 * Search tags within a domain by a query string.
 */
export function searchTagsForDomain(domainId: string, query: string): { id: string; label: string }[] {
  return searchTags(domainId, query);
}

/**
 * Look up a tag label by ID within a domain.
 */
export function lookupTagLabelForDomain(tagId: string, domainId?: string): string {
  const tags = domainId ? getAllTagsFlat(domainId) : ALL_TAGS;
  return tags.find((t) => t.id === tagId)?.label ?? tagId;
}

/** Backward-compat alias — re-export from observationTags */
export { lookupTagLabel } from "@/data/observationTags";

// ── Recently Used Tags (AsyncStorage) ──────────────────────────────────

const RECENT_TAGS_KEY = "eagoh_recent_tags";

/**
 * Record that a set of tags was used. Stores up to 20 most recent unique tag IDs
 * per user, ordered by most recent first.
 */
export async function recordRecentTags(tagIds: string[]): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(RECENT_TAGS_KEY);
    const existing: string[] = stored ? JSON.parse(stored) : [];
    const updated = [...new Set([...tagIds, ...existing])].slice(0, 20);
    await AsyncStorage.setItem(RECENT_TAGS_KEY, JSON.stringify(updated));
  } catch {
    // AsyncStorage is best-effort
  }
}

/**
 * Get recently used tag IDs, most recent first.
 */
export async function getRecentTags(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(RECENT_TAGS_KEY);
    return stored ? JSON.parse(stored) as string[] : [];
  } catch {
    return [];
  }
}

// ── DB Row ─────────────────────────────────────────────────────────────

export type OpenIntelligenceRow = {
  id: string;
  user_id: string;
  eagoh_id: string;
  intelligence_domain: string;
  entry_type: EntryType;
  tag: string; // stored tag id (or custom text) — backward compat
  content: string;
  character_count_no_spaces: number;
  confidence_level: ConfidenceLevel;
  quality_score: number;
  validation_status: ValidationStatus;
  influence_score: number; // stored as 0-100, mapped to low/medium/high on read
  selected_category?: string | null;
  selected_subtags?: string[] | null;
  custom_tags?: string[] | null;
  // Phase 5B fields
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

// ── Quality Scoring ────────────────────────────────────────────────────

interface ScoringInput {
  content: string;
  entryType: EntryType;
  confidenceLevel: ConfidenceLevel;
  tag: string;
}

export interface QualityScoreResult {
  qualityScore: number; // 0–100
  influenceScore: number; // 0–100, mapped to low/medium/high
}

/**
 * PREVIEW ONLY — local quality scoring for immediate UI feedback.
 *
 * The authoritative quality_score, influence_score, content_hash, and
 * duplicate_flag are calculated server-side by the DB trigger
 * (evaluate_oi_quality_trigger) and the worker's evaluateOpenIntelligenceQuality.
 * Client-submitted values for these fields are overwritten on insert/update.
 *
 * Do NOT rely on this score for ranking, validation, or reputation.
 *
 * Factors:
 *   - specificity (entity/name mentions)
 *   - entry length (relative to type max)
 *   - confidence level multiplier
 *   - tag selection signal
 */
export function computeQualityPreview(input: ScoringInput, domainId?: string): QualityScoreResult {
  const text = input.content.trim();
  const charCount = text.replace(/\s/g, "").length;
  const limit = ENTRY_TYPE_LIMITS[input.entryType];

  // Specificity: look for team/player/entity mentions via proper noun patterns
  const properNouns = (text.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).length;
  const specificityScore = Math.min(35, properNouns * 7 + (text.includes("vs") || text.includes("against") ? 8 : 0));

  // Length density: how used the character budget is
  const fillRatio = Math.min(1, charCount / limit);
  const lengthScore = Math.min(25, Math.round(fillRatio * 25));

  // Confidence multiplier
  const confidenceMultiplier: Record<ConfidenceLevel, number> = {
    weak_suspicion: 0.6,
    moderate_confidence: 0.8,
    strong_confidence: 1.0,
    verified_observation: 1.15,
  };
  const confidenceBase = Math.round(20 * confidenceMultiplier[input.confidenceLevel]);

  // Tag signal (custom tags get a small bonus for specificity)
  const domainTags = domainId ? getAllTagsFlat(domainId) : ALL_TAGS;
  const isCustomTag = !domainTags.some((t) => t.id === input.tag);
  const tagScore = isCustomTag ? 12 : 8;

  // Bonus: entry type depth
  const depthBonus: Record<EntryType, number> = {
    quick_observation: 0,
    basic_deep_entry: 4,
    advanced_deep_entry: 8,
  };

  const rawQuality = specificityScore + lengthScore + confidenceBase + tagScore + depthBonus[input.entryType];
  const qualityScore = Math.max(0, Math.min(100, rawQuality));

  // Influence: based on quality + confidence signal
  const rawInfluence = qualityScore * 0.7 + confidenceBase * 1.5 + specificityScore * 0.4;
  const influenceScore = Math.max(0, Math.min(100, Math.round(rawInfluence)));

  return { qualityScore, influenceScore };
}

function influenceLabel(score: number): InfluenceScore {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

// ── Tag formatting helpers ─────────────────────────────────────────────

/**
 * Format subtags array into a display string for the legacy `tag` column.
 */
function formatTagField(subtags: string[], customTags?: string[]): string {
  const all = [...subtags, ...(customTags ?? []).map((t) => `custom:${t}`)];
  return all.join(", ") || "general";
}

// ── CRUD ────────────────────────────────────────────────────────────────

export interface SubmitEntryInput {
  userId: string;
  profile: UserProfile;
  eagohId: string;
  intelligenceDomain: string;
  entryType: EntryType;
  tag: string;
  content: string;
  confidenceLevel: ConfidenceLevel;
  selectedCategory?: string;
  selectedSubtags?: string[];
  customTags?: string[];
}

export interface SubmitEntryResult {
  ok: boolean;
  entry?: OpenIntelligenceRow;
  error?: string;
  edgeCost?: number;
}

/**
 * Submit an open intelligence entry.
 *
 * Flow:
 *   1. Validate character count (excluding spaces)
 *   2. Check domain lock — entry must match EAGOH's domain
 *   3. Compute quality score
 *   4. Deduct Edge (subscription first, purchased second)
 *   5. Persist to Supabase
 *   6. Record recently used tags
 */
export async function submitEntry(input: SubmitEntryInput): Promise<SubmitEntryResult> {
  const cleanContent = input.content.trim();
  const charCountNoSpaces = cleanContent.replace(/\s/g, "").length;
  const limit = ENTRY_TYPE_LIMITS[input.entryType];

  if (charCountNoSpaces > limit) {
    return { ok: false, error: `Entry exceeds ${limit} character limit (excl. spaces). Currently at ${charCountNoSpaces}.` };
  }
  if (charCountNoSpaces === 0) {
    return { ok: false, error: "Entry cannot be empty." };
  }

  const edgeCost = ENTRY_TYPE_EDGE_COST[input.entryType];
  const totalEdge = (input.profile.edge_subscription ?? 0) + (input.profile.edge_purchased ?? 0);
  if (totalEdge < edgeCost) {
    return { ok: false, error: `Insufficient Neurons. Need ${edgeCost} Neurons (have ${totalEdge}).`, edgeCost };
  }

  // Deduct Edge
  let updatedProfile: UserProfile;
  try {
    const reason: EdgeReason = input.entryType === "quick_observation"
      ? "observation"
      : input.entryType === "basic_deep_entry"
        ? "observation"
        : "observation";
    updatedProfile = await spendEdge(
      input.userId,
      input.profile,
      edgeCost,
      reason,
      `OI ${input.entryType.replace(/_/g, " ")} · ${input.intelligenceDomain}`,
    );
  } catch (err) {
    return { ok: false, error: "Neuron deduction failed. Try again.", edgeCost };
  }

  // Quality score is PREVIEW only — the DB trigger (evaluate_oi_quality_trigger)
  // overwrites quality_score, influence_score, content_hash, and duplicate_flag
  // with server-authoritative values on insert. We send placeholder 0s.
  const subtags = input.selectedSubtags ?? [];
  const customTags = input.customTags ?? [];
  const formattedTag = formatTagField(subtags, customTags);

  const row: Omit<OpenIntelligenceRow, "id" | "created_at" | "updated_at"> = {
    user_id: input.userId,
    eagoh_id: input.eagohId,
    intelligence_domain: input.intelligenceDomain,
    entry_type: input.entryType,
    tag: formattedTag,
    content: cleanContent,
    character_count_no_spaces: charCountNoSpaces,
    confidence_level: input.confidenceLevel,
    quality_score: 0, // overwritten by DB trigger
    validation_status: "pending_review",
    influence_score: 0, // overwritten by DB trigger
    selected_category: input.selectedCategory ?? null,
    selected_subtags: subtags.length > 0 ? subtags : null,
    custom_tags: customTags.length > 0 ? customTags : null,
  };

  const { data, error } = await supabase
    .from("open_intelligence")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    console.warn("[open-intelligence] insert failed", error.message);
    return { ok: false, error: "Failed to save entry. Neurons were deducted. Please contact support." };
  }

  // Record recently used tags
  try {
    await recordRecentTags([...subtags, ...customTags.map((t) => `custom:${t}`)]);
  } catch {
    // best-effort
  }

  return { ok: true, entry: data as OpenIntelligenceRow, edgeCost };
}

/**
 * List entries for a specific EAGOH, newest first.
 */
export async function listEntriesForEagoh(
  eagohId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<OpenIntelligenceRow[]> {
  const { data, error } = await supabase
    .from("open_intelligence")
    .select("*")
    .eq("eagoh_id", eagohId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as OpenIntelligenceRow[];
}

/**
 * List all entries for the current user, newest first.
 */
export async function listAllEntries(
  userId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<OpenIntelligenceRow[]> {
  const { data, error } = await supabase
    .from("open_intelligence")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return (data ?? []) as OpenIntelligenceRow[];
}

/**
 * Count entries for an EAGOH.
 */
export async function countEntriesForEagoh(eagohId: string): Promise<number> {
  const { count, error } = await supabase
    .from("open_intelligence")
    .select("id", { count: "exact", head: true })
    .eq("eagoh_id", eagohId);
  if (error) throw error;
  return count ?? 0;
}

// ── Phase 5B: Server-side update (version history + dispute preservation) ─────

export interface UpdateEntryInput {
  entryId: string;
  content?: string;
  confidenceLevel?: ConfidenceLevel;
  selectedCategory?: string | null;
  selectedSubtags?: string[] | null;
  customTags?: string[] | null;
  exchangeShareEnabled?: boolean;
}

export interface UpdateEntryResult {
  ok: boolean;
  entry?: {
    id: string;
    qualityScore: number;
    influenceScore: number;
    contentHash: string | null;
    duplicateFlag: boolean;
    versionNumber: number;
  };
  error?: string;
}

/**
 * Update an Open Intelligence entry through the server-side worker.
 *
 * The worker:
 *   1. Verifies ownership
 *   2. Saves a version history record (preserving dispute history)
 *   3. Increments version_number on major content edits
 *   4. The DB trigger overwrites quality_score, influence_score, content_hash,
 *      and duplicate_flag with server-authoritative values
 *   5. Recalculates contributor reputation on major edits
 *
 * Client-submitted quality/influence/hash/duplicate values are ignored.
 */
export async function updateEntry(input: UpdateEntryInput): Promise<UpdateEntryResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    return { ok: false, error: "Not authenticated." };
  }

  const functionsUrl = process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL;
  if (!functionsUrl) {
    return { ok: false, error: "Backend not configured." };
  }

  try {
    const res = await fetch(`${functionsUrl}/oi/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
    });

    const data = (await res.json()) as UpdateEntryResult;
    return data;
  } catch (err) {
    console.warn("[open-intelligence] update failed", err);
    return { ok: false, error: "Network error. Try again." };
  }
}

/**
 * Toggle Exchange sharing on an Open Intelligence entry.
 *
 * This is a convenience wrapper around updateEntry that only changes
 * exchange_share_enabled. When a vendor disables sharing, the entry
 * immediately stops being used in future analyst Exchange retrieval.
 * Existing purchased access does not override withdrawal.
 */
export async function toggleExchangeShare(
  entryId: string,
  enabled: boolean,
): Promise<UpdateEntryResult> {
  return updateEntry({ entryId, exchangeShareEnabled: enabled });
}

// ── Phase 6A: Trust UI Service Functions ────────────────────────────────

/** Validation status display labels for trust indicators. */
export const VALIDATION_STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending Review",
  validated: "Community Supported",
  community_supported: "Community Supported",
  externally_supported: "Externally Supported",
  disputed: "Disputed",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  flagged: "Disputed",
};

/** Validation status colors for trust indicators. */
export function validationStatusColor(status: string): string {
  switch (status) {
    case "externally_supported":
      return "#00FFB2";
    case "community_supported":
    case "validated":
      return "#6CE6FF";
    case "pending_review":
      return "#8DA2B5";
    case "disputed":
    case "flagged":
      return "#FFB547";
    case "rejected":
    case "withdrawn":
      return "#FF4D6D";
    default:
      return "#8DA2B5";
  }
}

/** Trust label from reputation overall_score (0-100). */
export function trustLabel(score: number): string {
  if (score >= 80) return "Highly Trusted";
  if (score >= 60) return "Trusted";
  if (score >= 40) return "Neutral";
  return "Developing";
}

/** Trust label color from reputation overall_score. */
export function trustLabelColor(score: number): string {
  if (score >= 80) return "#00FFB2";
  if (score >= 60) return "#6CE6FF";
  if (score >= 40) return "#FFB547";
  return "#8DA2B5";
}

/** Feedback type display labels. */
export const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  helpful: "Helpful",
  accurate_to_my_experience: "Accurate to My Experience",
  needs_context: "Needs Context",
  outdated: "Outdated",
  incorrect: "Incorrect",
  misleading: "Misleading",
  abusive: "Abusive",
};

/** All feedback types in display order. */
export const FEEDBACK_TYPES_LIST: string[] = [
  "helpful",
  "accurate_to_my_experience",
  "needs_context",
  "outdated",
  "incorrect",
  "misleading",
  "abusive",
];

/** Dispute reason category display labels. */
export const DISPUTE_REASON_LABELS: Record<string, string> = {
  incorrect: "Incorrect",
  misleading: "Misleading",
  outdated: "Outdated",
  needs_context: "Needs Context",
  fabricated: "Fabricated",
  abusive: "Abusive",
  prohibited: "Prohibited",
  other: "Other",
};

/** All dispute reason categories in display order. */
export const DISPUTE_REASONS_LIST: string[] = [
  "incorrect",
  "misleading",
  "outdated",
  "needs_context",
  "fabricated",
  "abusive",
  "prohibited",
  "other",
];

// ── Worker call helpers ─────────────────────────────────────────────────

const FUNCTIONS_BASE_URL = process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL;

async function getWorkerAuth(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData?.session?.access_token ?? null;
}

/** Public contributor reputation (safe fields only). */
export type PublicReputation = {
  user_id: string;
  overall_score: number;
  calculated_at: string | null;
};

/** Fetch a user's public contributor reputation via the worker. */
export async function fetchPublicReputation(targetUserId: string): Promise<PublicReputation | null> {
  if (!FUNCTIONS_BASE_URL) return null;
  const token = await getWorkerAuth();
  if (!token) return null;
  try {
    const res = await fetch(
      `${FUNCTIONS_BASE_URL}/reputation?userId=${encodeURIComponent(targetUserId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = (await res.json()) as { ok: boolean; reputation?: PublicReputation };
    return data.ok ? data.reputation ?? null : null;
  } catch {
    return null;
  }
}

/** Batch fetch public reputations for multiple users. */
export async function fetchBulkPublicReputations(
  userIds: string[],
): Promise<Map<string, PublicReputation>> {
  const result = new Map<string, PublicReputation>();
  if (!userIds.length) return result;
  await Promise.all(
    userIds.map(async (uid) => {
      const rep = await fetchPublicReputation(uid);
      if (rep) result.set(uid, rep);
    }),
  );
  return result;
}

/** Vendor quality metrics from the safe RPC. */
export type VendorQualityMetrics = {
  avg_entry_quality: number;
  supported_entry_rate: number;
  dispute_rate: number;
  rejected_rate: number;
  recent_usefulness: number;
  eligible_exchange_entries: number;
  total_entries: number;
};

/** Fetch vendor quality metrics via the safe RPC. */
export async function fetchVendorQualityMetrics(
  vendorId: string,
): Promise<VendorQualityMetrics | null> {
  const { data, error } = await supabase
    .rpc("get_vendor_quality_metrics", { p_vendor_id: vendorId });
  if (error) {
    console.warn("[trust] vendor quality metrics failed", error.message);
    return null;
  }
  const row = (data as VendorQualityMetrics[])?.[0];
  return row ?? null;
}

/** Faction quality metrics from the safe RPC. */
export type FactionQualityMetrics = {
  total_shared_entries: number;
  avg_quality: number;
  supported_rate: number;
  disputed_rate: number;
  active_contributors: number;
  entries_used_in_responses: number;
};

/** Fetch faction quality metrics via the safe RPC. */
export async function fetchFactionQualityMetrics(
  factionId: string,
): Promise<FactionQualityMetrics | null> {
  const { data, error } = await supabase
    .rpc("get_faction_quality_metrics", { p_faction_id: factionId });
  if (error) {
    console.warn("[trust] faction quality metrics failed", error.message);
    return null;
  }
  const row = (data as FactionQualityMetrics[])?.[0];
  return row ?? null;
}

// ── Feedback & Dispute submission (secure worker only) ──────────────────

export type FeedbackResult =
  | { ok: true }
  | { ok: false; error: string };

/** Submit feedback through the secure worker. Never writes directly to Supabase. */
export async function submitFeedback(params: {
  entryId: string;
  feedbackType: string;
  optionalReason?: string;
  accessSource: "faction" | "exchange";
  factionId?: string;
  exchangePurchaseId?: string;
}): Promise<FeedbackResult> {
  if (!FUNCTIONS_BASE_URL) {
    return { ok: false, error: "Backend not configured." };
  }
  const token = await getWorkerAuth();
  if (!token) {
    return { ok: false, error: "Not authenticated." };
  }
  try {
    const res = await fetch(`${FUNCTIONS_BASE_URL}/feedback/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        entryId: params.entryId,
        feedbackType: params.feedbackType,
        optionalReason: params.optionalReason ?? undefined,
        accessSource: params.accessSource,
        factionId: params.factionId ?? undefined,
        exchangePurchaseId: params.exchangePurchaseId ?? undefined,
      }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.error ?? "Failed." };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
}

/** Submit a dispute through the secure worker. Never writes directly to Supabase. */
export async function submitDispute(params: {
  entryId: string;
  reasonCategory: string;
  explanation: string;
  supportingUrl?: string;
  accessSource: "faction" | "exchange";
  factionId?: string;
  exchangePurchaseId?: string;
}): Promise<FeedbackResult> {
  if (!FUNCTIONS_BASE_URL) {
    return { ok: false, error: "Backend not configured." };
  }
  const token = await getWorkerAuth();
  if (!token) {
    return { ok: false, error: "Not authenticated." };
  }
  try {
    const res = await fetch(`${FUNCTIONS_BASE_URL}/dispute/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        entryId: params.entryId,
        reasonCategory: params.reasonCategory,
        explanation: params.explanation,
        supportingUrl: params.supportingUrl ?? undefined,
        accessSource: params.accessSource,
        factionId: params.factionId ?? undefined,
        exchangePurchaseId: params.exchangePurchaseId ?? undefined,
      }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    return data.ok ? { ok: true } : { ok: false, error: data.error ?? "Failed." };
  } catch {
    return { ok: false, error: "Network error. Try again." };
  }
}

/** Re-export helpers */
export { influenceLabel };
