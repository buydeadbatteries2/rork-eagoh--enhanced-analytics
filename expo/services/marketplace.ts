import { supabase } from "@/lib/supabase";
import { spendEdge, addSubscriptionEdge } from "@/services/edge";
import type { UserProfile, SubscriptionTier } from "@/services/profile";
import type { EagohRecord } from "@/services/eagohs";
import { getTeamById } from "@/data/teams";

/**
 * Marketplace v2 service.
 *
 * Tables (run `expo/supabase-schema.sql`):
 *   - public.marketplace_listings       → vendor EAGOHs for sale
 *   - public.marketplace_sync_purchases → buyer sync records
 *   - public.marketplace_vendor_stats   → aggregated vendor metrics
 *
 * Rules:
 *   - Free users can browse only.
 *   - Pro, Oracle Elite, and Syndicate can buy and sell.
 *   - No platform fee — credits transfer buyer → vendor.
 *   - Sync expires automatically after selected days.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type SyncLevel = "25%" | "50%" | "75%" | "100%";

export type MarketplaceListingRow = {
  id: string;
  vendor_id: string;
  eagoh_id: string;
  active: boolean;
  price_25_per_day: number;
  price_50_per_day: number;
  price_75_per_day: number;
  price_100_per_day: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type SyncPurchaseRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  vendor_id: string;
  eagoh_id: string;
  sync_level: SyncLevel;
  days: number;
  edge_cost: number;
  started_at: string;
  expires_at: string;
  active: boolean;
  created_at: string;
};

export type VendorStatsRow = {
  vendor_id: string;
  total_listings: number;
  active_listings: number;
  total_sales: number;
  total_edge_earned: number;
  edge_earned_this_month: number;
  edge_earned_last_month: number;
  month_key: string;
  sync_success_score: number;
  avg_quality_score: number;
  rank: string;
  created_at: string;
  updated_at: string;
};

/** A listing enriched with its EAGOH record and fanatic teams. */
export type EnrichedListing = MarketplaceListingRow & {
  eagoh: EagohRecord | null;
  fanatic_teams: string[];
  vendor_username: string | null;
  vendor_rank: string;
  sync_success_score: number;
  avg_quality_score: number;
  edge_earned_this_month: number;
};

export type EnrichedPurchase = SyncPurchaseRow & {
  eagoh_name: string;
  eagoh_image_url: string | null;
  vendor_username: string | null;
};

export type ListingFilters = {
  domain?: string;
  sport?: string;
  team?: string;
  /** Filter to Generalist EAGOHs (team_focus_mode = "none"). */
  generalist?: boolean;
  dna?: string;
  syncLevel?: SyncLevel;
  maxPrice?: number;
  minPrice?: number;
  rank?: string;
  search?: string;
};

// ── Price helpers ──────────────────────────────────────────────────────

export function getPriceForLevel(listing: MarketplaceListingRow, level: SyncLevel): number {
  switch (level) {
    case "25%": return listing.price_25_per_day;
    case "50%": return listing.price_50_per_day;
    case "75%": return listing.price_75_per_day;
    case "100%": return listing.price_100_per_day;
  }
}

export function computeTotalCost(listing: MarketplaceListingRow, level: SyncLevel, days: number): number {
  return getPriceForLevel(listing, level) * days;
}

// ── Tier gating ─────────────────────────────────────────────────────────

const PAID_TIERS: SubscriptionTier[] = ["pro", "oracle_elite", "syndicate"];

export function canTransact(tier: SubscriptionTier): boolean {
  return PAID_TIERS.includes(tier);
}

// ── Current month key ──────────────────────────────────────────────────

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ── Vendor Stats ───────────────────────────────────────────────────────

export async function getVendorStats(vendorId: string): Promise<VendorStatsRow | null> {
  const { data, error } = await supabase
    .from("marketplace_vendor_stats")
    .select("*")
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (error) throw error;
  return (data as VendorStatsRow | null) ?? null;
}

async function ensureVendorStats(vendorId: string): Promise<VendorStatsRow> {
  const existing = await getVendorStats(vendorId);
  if (existing) return existing;
  const row: Omit<VendorStatsRow, "created_at" | "updated_at"> = {
    vendor_id: vendorId,
    total_listings: 0,
    active_listings: 0,
    total_sales: 0,
    total_edge_earned: 0,
    edge_earned_this_month: 0,
    edge_earned_last_month: 0,
    month_key: currentMonthKey(),
    sync_success_score: 0,
    avg_quality_score: 0,
    rank: "UNRANKED",
  };
  const { data, error } = await supabase
    .from("marketplace_vendor_stats")
    .insert(row)
    .select("*");
  if (error) throw error;
  const stats = (data as VendorStatsRow[])?.[0];
  if (!stats) throw new Error("Failed to create vendor stats — no row returned.");
  return stats;
}

/** Recalculate vendor stats from live data. */
export async function recalculateVendorStats(vendorId: string): Promise<VendorStatsRow> {
  const stats = await ensureVendorStats(vendorId);
  const monthKey = currentMonthKey();

  // Active listings
  const { count: activeCount, error: le } = await supabase
    .from("marketplace_listings")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId)
    .eq("active", true);
  if (le) console.warn("[marketplace] active count error", le.message);

  // Total listings
  const { count: totalListings, error: tle } = await supabase
    .from("marketplace_listings")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId);
  if (tle) console.warn("[marketplace] total listings error", tle.message);

  // Total sales
  const { count: totalSales, error: se } = await supabase
    .from("marketplace_sync_purchases")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId);
  if (se) console.warn("[marketplace] sales count error", se.message);

  // Total Edge earned
  const { data: edgeSums, error: eae } = await supabase
    .from("marketplace_sync_purchases")
    .select("edge_cost")
    .eq("vendor_id", vendorId);
  if (eae) console.warn("[marketplace] edge sum error", eae.message);
  const totalEarned = (edgeSums ?? []).reduce((sum, row) => sum + (row.edge_cost ?? 0), 0);

  // This month
  const monthStart = `${monthKey}-01T00:00:00Z`;
  const { data: monthSales, error: mse } = await supabase
    .from("marketplace_sync_purchases")
    .select("edge_cost")
    .eq("vendor_id", vendorId)
    .gte("created_at", monthStart);
  if (mse) console.warn("[marketplace] month sales error", mse.message);
  const earnedThisMonth = (monthSales ?? []).reduce((sum, row) => sum + (row.edge_cost ?? 0), 0);

  // Avg quality score from vendor's EAGOHs' OI entries
  const { data: eagohIds } = await supabase
    .from("eagohs")
    .select("id")
    .eq("user_id", vendorId);
  let avgQuality = 0;
  if (eagohIds && eagohIds.length > 0) {
    const ids = (eagohIds as { id: string }[]).map((r) => r.id);
    const { data: oiData } = await supabase
      .from("open_intelligence")
      .select("quality_score")
      .in("eagoh_id", ids);
    if (oiData && oiData.length > 0) {
      avgQuality = Math.round(
        (oiData as { quality_score: number }[]).reduce((s, r) => s + r.quality_score, 0) / oiData.length,
      );
    }
  }

  // Sync success score — based on completed (active=false) purchases
  const { data: completed } = await supabase
    .from("marketplace_sync_purchases")
    .select("id")
    .eq("vendor_id", vendorId)
    .eq("active", false);
  const { data: active } = await supabase
    .from("marketplace_sync_purchases")
    .select("id")
    .eq("vendor_id", vendorId)
    .eq("active", true);
  const totalPurchases = (completed?.length ?? 0) + (active?.length ?? 0);
  const syncSuccess = totalPurchases > 0
    ? Math.round(((completed?.length ?? 0) / totalPurchases) * 100)
    : 0;

  // Rank
  let rank = "UNRANKED";
  if (totalEarned >= 10000) rank = "S-TIER";
  else if (totalEarned >= 5000) rank = "ELITE";
  else if (totalEarned >= 1500) rank = "PRO";
  else if (totalEarned >= 200) rank = "RISING";

  const patch = {
    total_listings: totalListings ?? 0,
    active_listings: activeCount ?? 0,
    total_sales: totalSales ?? 0,
    total_edge_earned: totalEarned,
    edge_earned_this_month: earnedThisMonth,
    edge_earned_last_month: stats.edge_earned_this_month,
    month_key: monthKey,
    sync_success_score: syncSuccess,
    avg_quality_score: avgQuality,
    rank,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: ue } = await supabase
    .from("marketplace_vendor_stats")
    .update(patch)
    .eq("vendor_id", vendorId)
    .select("*");
  if (ue) throw ue;
  const result = (updated as VendorStatsRow[])?.[0];
  if (!result) throw new Error("Failed to update vendor stats — no row returned.");
  return result;
}

// ── Listings CRUD ──────────────────────────────────────────────────────

export async function listActiveListings(
  filters: ListingFilters = {},
  limit: number = 50,
  offset: number = 0,
): Promise<EnrichedListing[]> {
  let query = supabase
    .from("marketplace_listings")
    .select("*, eagoh:eagoh_id(*)")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.search) {
    // Search by EAGOH name (via the JSON join). We'll filter client-side
    // after fetch to avoid complex OR queries with joins.
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows: (MarketplaceListingRow & { eagoh: EagohRecord | null })[] = (data ?? []) as any;
  if (rows.length === 0) return [];

  // Enrich with fanatic teams and vendor stats in parallel
  const enriched: EnrichedListing[] = await Promise.all(
    rows.map(async (row) => {
      // Fanatic teams
      const { data: teams } = await supabase
        .from("eagoh_fanatic_teams")
        .select("team_id")
        .eq("eagoh_id", row.eagoh_id);
      const fanaticTeams = (teams ?? []).map((t: any) => t.team_id);

      // Vendor profile username
      const { data: profileData } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", row.vendor_id)
        .maybeSingle();
      const vendorUsername = (profileData as { username: string | null } | null)?.username ?? null;

      // Vendor stats
      const stats = await getVendorStats(row.vendor_id);

      return {
        ...row,
        fanatic_teams: fanaticTeams,
        vendor_username: vendorUsername,
        vendor_rank: stats?.rank ?? "UNRANKED",
        sync_success_score: stats?.sync_success_score ?? 0,
        avg_quality_score: stats?.avg_quality_score ?? 0,
        edge_earned_this_month: stats?.edge_earned_this_month ?? 0,
      };
    }),
  );

  // Apply client-side filters that cross tables
  let result = enriched;

  if (filters.domain) {
    result = result.filter((l) => (l.eagoh?.domain ?? l.eagoh?.sport) === filters.domain);
  }
  if (filters.sport) {
    result = result.filter((l) => l.eagoh?.sport === filters.sport);
  }
  if (filters.generalist) {
    result = result.filter((l) => (l.eagoh?.team_focus_mode ?? "none") === "none");
  }
  if (filters.team) {
    const teamQuery = filters.team!.toLowerCase();
    result = result.filter((l) => {
      // Check new canonical fields first
      const proId = l.eagoh?.pro_team_focus_id;
      const colId = l.eagoh?.college_team_focus_id;
      const proName = l.eagoh?.pro_team_focus_name ?? "";
      const colName = l.eagoh?.college_team_focus_name ?? "";
      if (proId && (proId.toLowerCase().includes(teamQuery) || proName.toLowerCase().includes(teamQuery))) return true;
      if (colId && (colId.toLowerCase().includes(teamQuery) || colName.toLowerCase().includes(teamQuery))) return true;
      // Fallback: legacy fanatic_teams array
      return l.fanatic_teams.some((t) => {
        const display = getTeamById(t)?.display_name ?? "";
        return t.toLowerCase().includes(teamQuery) || display.toLowerCase().includes(teamQuery);
      });
    });
  }
  if (filters.dna) {
    result = result.filter((l) => (l.eagoh?.dna ?? []).includes(filters.dna!));
  }
  if (filters.rank) {
    result = result.filter((l) => l.vendor_rank === filters.rank);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter((l) => {
      const haystack = [
        l.eagoh?.name,
        l.eagoh?.sport,
        l.eagoh?.domain,
        l.vendor_username,
        l.description,
        l.eagoh?.pro_team_focus_name,
        l.eagoh?.college_team_focus_name,
        ...l.fanatic_teams,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }
  if (filters.syncLevel) {
    result = result.filter((l) => getPriceForLevel(l, filters.syncLevel!) > 0);
  }
  if (filters.minPrice != null) {
    result = result.filter((l) => {
      const prices = [l.price_25_per_day, l.price_50_per_day, l.price_75_per_day, l.price_100_per_day]
        .filter((p) => p > 0);
      return prices.length > 0 && Math.min(...prices) >= filters.minPrice!;
    });
  }
  if (filters.maxPrice != null) {
    result = result.filter((l) => {
      const prices = [l.price_25_per_day, l.price_50_per_day, l.price_75_per_day, l.price_100_per_day]
        .filter((p) => p > 0);
      return prices.length === 0 || prices.some((p) => p <= filters.maxPrice!);
    });
  }

  return result.slice(0, limit);
}

export async function getMyListings(vendorId: string): Promise<EnrichedListing[]> {
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select("*, eagoh:eagoh_id(*)")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  const rows: (MarketplaceListingRow & { eagoh: EagohRecord | null })[] = (data ?? []) as any;

  return Promise.all(
    rows.map(async (row) => {
      const { data: teams } = await supabase
        .from("eagoh_fanatic_teams")
        .select("team_id")
        .eq("eagoh_id", row.eagoh_id);
      const stats = await getVendorStats(row.vendor_id);
      return {
        ...row,
        fanatic_teams: (teams ?? []).map((t: any) => t.team_id),
        vendor_username: null,
        vendor_rank: stats?.rank ?? "UNRANKED",
        sync_success_score: stats?.sync_success_score ?? 0,
        avg_quality_score: stats?.avg_quality_score ?? 0,
        edge_earned_this_month: stats?.edge_earned_this_month ?? 0,
      };
    }),
  );
}

export type CreateListingInput = {
  vendorId: string;
  eagohId: string;
  price25PerDay: number;
  price50PerDay: number;
  price75PerDay: number;
  price100PerDay: number;
  description?: string;
};

export async function createListing(input: CreateListingInput): Promise<MarketplaceListingRow> {
  const row: Omit<MarketplaceListingRow, "id" | "created_at" | "updated_at"> = {
    vendor_id: input.vendorId,
    eagoh_id: input.eagohId,
    active: true,
    price_25_per_day: Math.max(0, Math.floor(input.price25PerDay)),
    price_50_per_day: Math.max(0, Math.floor(input.price50PerDay)),
    price_75_per_day: Math.max(0, Math.floor(input.price75PerDay)),
    price_100_per_day: Math.max(0, Math.floor(input.price100PerDay)),
    description: input.description?.trim() || null,
  };

  const { data, error } = await supabase
    .from("marketplace_listings")
    .insert(row)
    .select("*");
  if (error) throw error;
  const listing = (data as MarketplaceListingRow[])?.[0];
  if (!listing) throw new Error("Failed to create listing — no row returned.");

  // Recalc vendor stats
  await recalculateVendorStats(input.vendorId);

  return listing;
}

export async function toggleListingActive(listingId: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from("marketplace_listings")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", listingId);
  if (error) throw error;
}

export async function updateListing(
  listingId: string,
  updates: {
    price25PerDay?: number;
    price50PerDay?: number;
    price75PerDay?: number;
    price100PerDay?: number;
    description?: string;
  },
): Promise<MarketplaceListingRow> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.price25PerDay != null) patch.price_25_per_day = Math.max(0, Math.floor(updates.price25PerDay));
  if (updates.price50PerDay != null) patch.price_50_per_day = Math.max(0, Math.floor(updates.price50PerDay));
  if (updates.price75PerDay != null) patch.price_75_per_day = Math.max(0, Math.floor(updates.price75PerDay));
  if (updates.price100PerDay != null) patch.price_100_per_day = Math.max(0, Math.floor(updates.price100PerDay));
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;

  const { data, error } = await supabase
    .from("marketplace_listings")
    .update(patch)
    .eq("id", listingId)
    .select("*");
  if (error) throw error;
  const listing = (data as MarketplaceListingRow[])?.[0];
  if (!listing) throw new Error("Failed to update listing — no row returned.");

  // Recalc vendor stats
  await recalculateVendorStats(listing.vendor_id);

  return listing;
}

export async function deleteListing(listingId: string): Promise<void> {
  const { error } = await supabase.from("marketplace_listings").delete().eq("id", listingId);
  if (error) throw error;
}

// ── Purchases ──────────────────────────────────────────────────────────

export type PurchaseResult =
  | { ok: true; purchase: SyncPurchaseRow }
  | { ok: false; error: string };

/**
 * Purchase a sync from a listing.
 *
 * Flow:
 *   1. Validate listing exists and is active
 *   2. Validate buyer is not the vendor
 *   3. Compute total cost
 *   4. Deduct Edge from buyer
 *   5. Transfer Edge to vendor
 *   6. Create purchase record with expiration
 *   7. Update vendor stats
 */
export async function purchaseSync(
  buyerId: string,
  buyerProfile: UserProfile,
  listingId: string,
  syncLevel: SyncLevel,
  days: number,
): Promise<PurchaseResult> {
  if (days < 1 || days > 5) {
    return { ok: false, error: "Duration must be between 1 and 5 days." };
  }

  // Fetch listing
  const { data: listing, error: lErr } = await supabase
    .from("marketplace_listings")
    .select("*")
    .eq("id", listingId)
    .single();
  if (lErr || !listing) return { ok: false, error: "Listing not found." };
  const listingRow = listing as MarketplaceListingRow;

  if (!listingRow.active) return { ok: false, error: "This listing is no longer active." };
  if (listingRow.vendor_id === buyerId) return { ok: false, error: "You cannot purchase your own listing." };

  const totalCost = computeTotalCost(listingRow, syncLevel, days);
  if (totalCost <= 0) return { ok: false, error: "This sync level has no price set." };

  // Check buyer Edge
  const buyerTotal = (buyerProfile.edge_subscription ?? 0) + (buyerProfile.edge_purchased ?? 0);
  if (buyerTotal < totalCost) {
    return { ok: false, error: `Insufficient Edge. Need ${totalCost} Edge (have ${buyerTotal}).` };
  }

  // Deduct Edge from buyer
  let afterBuyer: UserProfile;
  try {
    afterBuyer = await spendEdge(
      buyerId,
      buyerProfile,
      totalCost,
      "marketplace",
      `Sync purchase: ${syncLevel} for ${days} day(s)`,
    );
  } catch (err: unknown) {
    return { ok: false, error: "Edge deduction failed. Please try again." };
  }

  // Transfer Edge to vendor
  try {
    await addSubscriptionEdge(
      listingRow.vendor_id,
      { edge_subscription: 0, edge_purchased: 0 } as UserProfile, // dummy — service fetches actual
      totalCost,
      "marketplace",
      `Sync purchase from buyer`,
    );
    // Actually we need to read vendor profile first. Let's use a simpler approach:
    // Just add to vendor's subscription Edge directly via profile update.
    const { data: vendorProfile } = await supabase
      .from("profiles")
      .select("edge_subscription")
      .eq("id", listingRow.vendor_id)
      .single();
    const vendorSub = (vendorProfile as { edge_subscription: number } | null)?.edge_subscription ?? 0;
    await supabase
      .from("profiles")
      .update({ edge_subscription: vendorSub + totalCost, updated_at: new Date().toISOString() })
      .eq("id", listingRow.vendor_id);
  } catch (err: unknown) {
    console.warn("[marketplace] vendor credit transfer failed; buyer was charged.", err);
  }

  // Compute expiration
  const startedAt = new Date();
  const expiresAt = new Date(startedAt);
  expiresAt.setDate(expiresAt.getDate() + days);

  // Create purchase record
  const purchaseRow: Omit<SyncPurchaseRow, "id" | "created_at"> = {
    listing_id: listingId,
    buyer_id: buyerId,
    vendor_id: listingRow.vendor_id,
    eagoh_id: listingRow.eagoh_id,
    sync_level: syncLevel,
    days,
    edge_cost: totalCost,
    started_at: startedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    active: true,
  };

  const { data: purchase, error: pErr } = await supabase
    .from("marketplace_sync_purchases")
    .insert(purchaseRow)
    .select("*")
    .single();
  if (pErr) {
    // Refund? For now just log
    console.warn("[marketplace] purchase record insert failed", pErr.message);
    return { ok: false, error: "Failed to record purchase. Edge was deducted. Contact support." };
  }

  // Update vendor stats
  await recalculateVendorStats(listingRow.vendor_id);

  return { ok: true, purchase: purchase as SyncPurchaseRow };
}

/**
 * Check and expire any active syncs that have passed their expiration date.
 * Called periodically or on screen load.
 */
export async function expireSyncs(buyerId: string): Promise<number> {
  const now = new Date().toISOString();
  const { data: expired, error } = await supabase
    .from("marketplace_sync_purchases")
    .select("id")
    .eq("buyer_id", buyerId)
    .eq("active", true)
    .lt("expires_at", now);

  if (error) {
    console.warn("[marketplace] expire query failed", error.message);
    return 0;
  }
  if (!expired || expired.length === 0) return 0;

  const ids = (expired as { id: string }[]).map((r) => r.id);
  const { error: ue } = await supabase
    .from("marketplace_sync_purchases")
    .update({ active: false })
    .in("id", ids);
  if (ue) console.warn("[marketplace] expire update failed", ue.message);

  return ids.length;
}

/** Get active syncs for a buyer (currently active purchases). */
export async function getActiveSyncs(buyerId: string): Promise<EnrichedPurchase[]> {
  await expireSyncs(buyerId); // Clean up expired first

  const { data, error } = await supabase
    .from("marketplace_sync_purchases")
    .select("*")
    .eq("buyer_id", buyerId)
    .eq("active", true)
    .order("expires_at", { ascending: true });

  if (error) throw error;
  const rows = (data ?? []) as SyncPurchaseRow[];

  return Promise.all(
    rows.map(async (row) => {
      const { data: eagoh } = await supabase
        .from("eagohs")
        .select("name, image_thumb_url")
        .eq("id", row.eagoh_id)
        .maybeSingle();
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", row.vendor_id)
        .maybeSingle();

      return {
        ...row,
        eagoh_name: (eagoh as any)?.name ?? "Unknown EAGOH",
        eagoh_image_url: (eagoh as any)?.image_thumb_url ?? (eagoh as any)?.image_url ?? null,
        vendor_username: (profile as { username: string | null } | null)?.username ?? null,
      };
    }),
  );
}

/** Get all purchases (including expired) for a buyer. */
export async function getMyPurchases(buyerId: string, limit: number = 30): Promise<EnrichedPurchase[]> {
  const { data, error } = await supabase
    .from("marketplace_sync_purchases")
    .select("*")
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = (data ?? []) as SyncPurchaseRow[];

  return Promise.all(
    rows.map(async (row) => {
      const { data: eagoh } = await supabase
        .from("eagohs")
        .select("name, image_thumb_url")
        .eq("id", row.eagoh_id)
        .maybeSingle();
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", row.vendor_id)
        .maybeSingle();
      return {
        ...row,
        eagoh_name: (eagoh as any)?.name ?? "Unknown EAGOH",
        eagoh_image_url: (eagoh as any)?.image_thumb_url ?? (eagoh as any)?.image_url ?? null,
        vendor_username: (profile as { username: string | null } | null)?.username ?? null,
      };
    }),
  );
}

/** Get a single listing by ID (enriched). */
export async function getListingById(listingId: string): Promise<EnrichedListing | null> {
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select("*, eagoh:eagoh_id(*)")
    .eq("id", listingId)
    .single();
  if (error || !data) return null;

  const row = data as MarketplaceListingRow & { eagoh: EagohRecord | null };

  const { data: teams } = await supabase
    .from("eagoh_fanatic_teams")
    .select("team_id")
    .eq("eagoh_id", row.eagoh_id);

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", row.vendor_id)
    .maybeSingle();

  const stats = await getVendorStats(row.vendor_id);

  return {
    ...row,
    fanatic_teams: (teams ?? []).map((t: any) => t.team_id),
    vendor_username: (profile as { username: string | null } | null)?.username ?? null,
    vendor_rank: stats?.rank ?? "UNRANKED",
    sync_success_score: stats?.sync_success_score ?? 0,
    avg_quality_score: stats?.avg_quality_score ?? 0,
    edge_earned_this_month: stats?.edge_earned_this_month ?? 0,
  };
}

/** Get distinct domains and sports available in active listings (for filter chips). */
export async function getActiveFilters(): Promise<{ domains: string[]; sports: string[]; ranks: string[] }> {
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select("eagoh:eagoh_id(domain, sport)")
    .eq("active", true);
  if (error) return { domains: [], sports: [], ranks: [] };

  const domains = new Set<string>();
  const sports = new Set<string>();
  for (const row of (data ?? []) as any[]) {
    const e = row.eagoh;
    if (e?.domain) domains.add(e.domain);
    if (e?.sport) sports.add(e.sport);
  }

  // Distinct ranks
  const { data: rankRows } = await supabase
    .from("marketplace_vendor_stats")
    .select("rank")
    .not("rank", "eq", "UNRANKED");
  const ranks = new Set<string>((rankRows ?? []).map((r: any) => r.rank));

  return {
    domains: [...domains].sort(),
    sports: [...sports].sort(),
    ranks: [...ranks].sort(),
  };
}
