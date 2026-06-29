/**
 * Edge Store service — Neuron pack definitions and mock purchase logic.
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

/** RevenueCat product identifiers for Neuron packs. */
export const EDGE_PRODUCT_IDS = [
  "store_edge_250",
  "store_edge_750",
  "store_edge_2000",
  "store_edge_6000",
  "store_edge_15000",
] as const;
export type EdgeProductId = (typeof EDGE_PRODUCT_IDS)[number];

/** A Neuron pack definition shown in the store UI. */
export type EdgePack = {
  /** RevenueCat product ID (placeholder for future). */
  productId: EdgeProductId;
  /** Neurons awarded on purchase. */
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

/** All Neuron packs — single source of truth. */
export const EDGE_PACKS: EdgePack[] = [
  {
    productId: "store_edge_250",
    edgeAmount: 250,
    priceUsd: 4.99,
    label: "250 Neurons",
    badge: null,
    sortKey: 1,
  },
  {
    productId: "store_edge_750",
    edgeAmount: 750,
    priceUsd: 9.99,
    label: "750 Neurons",
    badge: null,
    sortKey: 2,
  },
  {
    productId: "store_edge_2000",
    edgeAmount: 2000,
    priceUsd: 19.99,
    label: "2,000 Neurons",
    badge: null,
    sortKey: 3,
  },
  {
    productId: "store_edge_6000",
    edgeAmount: 6000,
    priceUsd: 49.99,
    label: "6,000 Neurons",
    badge: "Best Value",
    sortKey: 4,
  },
  {
    productId: "store_edge_15000",
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
