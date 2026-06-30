import type { SubscriptionTier } from "@/services/profile";

/**
 * Centralized Free-tier permission system.
 *
 * All feature gates that depend on the effective subscription tier live here.
 * Screen-level checks read from these helpers so the rules stay in one place
 * and every guard is consistent.
 */

/** Session types that exist in the app. */
export type SessionTypeId =
  | "quick-check"
  | "quick-analysis"
  | "standard"
  | "oracle"
  | "premium-event"
  | "open-intelligence"
  | "faction-network"
  | "my-rankings";

/**
 * Free users are allowed ONLY Quick Check, Faction Network (view-only),
 * and My Rankings (view-only).
 */
const FREE_ALLOWED_SESSIONS: ReadonlySet<SessionTypeId> = new Set([
  "quick-check",
  "faction-network",
  "my-rankings",
]);

/** Returns true when the given tier is allowed to use the specified session type. */
export function canUseSessionType(tier: SubscriptionTier, sessionId: SessionTypeId): boolean {
  if (tier !== "free") return true;
  return FREE_ALLOWED_SESSIONS.has(sessionId);
}

/** Free users may never use Forge. */
export function canUseForge(tier: SubscriptionTier): boolean {
  return tier !== "free";
}

/** Quick Check is the only analysis session available to free users, and it is always available. */
export function canUseQuickCheck(_tier: SubscriptionTier): boolean {
  return true;
}

/** Free users may never use the Exchange / marketplace. */
export function canUseExchange(tier: SubscriptionTier): boolean {
  return tier !== "free";
}

/** Free users may never use Open Intelligence. */
export function canUseOpenIntelligence(tier: SubscriptionTier): boolean {
  return tier !== "free";
}

/** Free users may never create or join Factions. */
export function canUseFactions(tier: SubscriptionTier): boolean {
  return tier !== "free";
}

/** Free users may view the subscription / Neuron store to upgrade. */
export function canViewSubscriptionStore(_tier: SubscriptionTier): boolean {
  return true;
}

/** Free users may never purchase sync access on the Exchange. */
export function canPurchaseSync(tier: SubscriptionTier): boolean {
  return tier !== "free";
}

/** Free users may never list EAGOHs on the Exchange. */
export function canListOnExchange(tier: SubscriptionTier): boolean {
  return tier !== "free";
}

/** Free users may never create, rename, or reforge EAGOHs. */
export function canCreateEagoh(tier: SubscriptionTier): boolean {
  return tier !== "free";
}

/** Free users may never rename EAGOHs (reinforced server-side too). */
export function canRenameEagoh(tier: SubscriptionTier): boolean {
  return tier !== "free";
}
