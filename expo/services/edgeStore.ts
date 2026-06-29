/**
 * Edge Store service — EdgeCoin pack definitions and mock purchase logic.
 *
 * Future: replace `mockPurchasePack` with RevenueCat purchase handlers.
 * Product IDs and pack definitions are structured so the UI can be reused
 * with minimal changes once RevenueCat is integrated.
 *
 * Rules:
 *  - Purchased Edge never expires and always rolls over 100%.
 *  - Subscription Edge is always spent first, purchased Edge second.
 *  - The service layer enforces the spend priority; mutations log transactions.
 */

import { addPurchasedEdge } from "@/services/edge";
import type { UserProfile } from "@/services/profile";

/** RevenueCat-compatible product identifiers (placeholders for future integration). */
export const EDGE_PRODUCT_IDS = [
  "edge_250",
  "edge_750",
  "edge_2000",
  "edge_6000",
  "edge_15000",
] as const;
export type EdgeProductId = (typeof EDGE_PRODUCT_IDS)[number];

/** An EdgeCoin pack definition shown in the store UI. */
export type EdgePack = {
  /** RevenueCat product ID (placeholder for future). */
  productId: EdgeProductId;
  /** EdgeCoins awarded on purchase. */
  edgeAmount: number;
  /** USD price displayed in the UI. */
  priceUsd: number;
  /** Display label (e.g. "250 Edge"). */
  label: string;
  /** Optional badge shown on the pack card (e.g. "Best Value"). */
  badge: string | null;
  /** Lexicographic sort key so cheaper packs appear first. */
  sortKey: number;
};

/** All EdgeCoin packs — single source of truth. */
export const EDGE_PACKS: EdgePack[] = [
  {
    productId: "edge_250",
    edgeAmount: 250,
    priceUsd: 4.99,
    label: "250 Neurons",
    badge: null,
    sortKey: 1,
  },
  {
    productId: "edge_750",
    edgeAmount: 750,
    priceUsd: 9.99,
    label: "750 Neurons",
    badge: null,
    sortKey: 2,
  },
  {
    productId: "edge_2000",
    edgeAmount: 2000,
    priceUsd: 19.99,
    label: "2,000 Neurons",
    badge: null,
    sortKey: 3,
  },
  {
    productId: "edge_6000",
    edgeAmount: 6000,
    priceUsd: 49.99,
    label: "6,000 Neurons",
    badge: "Best Value",
    sortKey: 4,
  },
  {
    productId: "edge_15000",
    edgeAmount: 15000,
    priceUsd: 99.99,
    label: "15,000 Neurons",
    badge: "Power User",
    sortKey: 5,
  },
];

/**
 * Execute a mock purchase for the given pack.
 *
 * In test mode this directly adds Edge to `edge_purchased` with a
 * descriptive transaction note.  When RevenueCat is integrated,
 * replace this call with a RevenueCat purchase handler that calls
 * `addPurchasedEdge` after verification.
 */
export async function mockPurchasePack(
  userId: string,
  profile: UserProfile,
  pack: EdgePack,
): Promise<UserProfile> {
  const note = `Mock Edge purchase: ${pack.label} (${pack.productId})`;
  return addPurchasedEdge(userId, profile, pack.edgeAmount, note);
}
