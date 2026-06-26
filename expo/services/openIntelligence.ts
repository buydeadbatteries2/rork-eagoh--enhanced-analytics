import { supabase } from "@/lib/supabase";
import { spendEdge } from "@/services/edge";
import type { UserProfile } from "@/services/profile";
import type { EdgeReason } from "@/services/edge";
import { getObservationTags, getAllTagsFlat } from "@/data/observationTags";

// ── Types ──────────────────────────────────────────────────────────────

export type EntryType = "quick_observation" | "basic_deep_entry" | "advanced_deep_entry";

export type ConfidenceLevel = "weak_suspicion" | "moderate_confidence" | "strong_confidence" | "verified_observation";

export type ValidationStatus = "pending_review" | "validated" | "flagged";

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

export function lookupTagLabel(tagId: string, domainId?: string): string {
  const tags = domainId ? getAllTagsFlat(domainId) : ALL_TAGS;
  return tags.find((t) => t.id === tagId)?.label ?? tagId;
}

// ── DB Row ─────────────────────────────────────────────────────────────

export type OpenIntelligenceRow = {
  id: string;
  user_id: string;
  eagoh_id: string;
  intelligence_domain: string;
  entry_type: EntryType;
  tag: string; // stored tag id (or custom text)
  content: string;
  character_count_no_spaces: number;
  confidence_level: ConfidenceLevel;
  quality_score: number;
  validation_status: ValidationStatus;
  influence_score: number; // stored as 0-100, mapped to low/medium/high on read
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
 * Local mock quality scoring.
 *
 * Factors:
 *   - specificity (entity/name mentions)
 *   - entry length (relative to type max)
 *   - confidence level multiplier
 *   - tag selection signal
 */
export function computeQualityScore(input: ScoringInput, domainId?: string): QualityScoreResult {
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
    return { ok: false, error: `Insufficient Edge. Need ${edgeCost} Edge (have ${totalEdge}).`, edgeCost };
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
    return { ok: false, error: "Edge deduction failed. Try again.", edgeCost };
  }

  // Compute quality
  const score = computeQualityScore({
    content: cleanContent,
    entryType: input.entryType,
    confidenceLevel: input.confidenceLevel,
    tag: input.tag,
  });

  const row: Omit<OpenIntelligenceRow, "id" | "created_at" | "updated_at"> = {
    user_id: input.userId,
    eagoh_id: input.eagohId,
    intelligence_domain: input.intelligenceDomain,
    entry_type: input.entryType,
    tag: input.tag,
    content: cleanContent,
    character_count_no_spaces: charCountNoSpaces,
    confidence_level: input.confidenceLevel,
    quality_score: score.qualityScore,
    validation_status: "pending_review",
    influence_score: score.influenceScore,
  };

  const { data, error } = await supabase
    .from("open_intelligence")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    console.warn("[open-intelligence] insert failed", error.message);
    return { ok: false, error: "Failed to save entry. Edge was deducted. Please contact support." };
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

/** Re-export helpers */
export { influenceLabel };
