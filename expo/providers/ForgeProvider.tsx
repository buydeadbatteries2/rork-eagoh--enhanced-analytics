import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useProfile } from "@/providers/ProfileProvider";
import { useEdge } from "@/providers/EdgeProvider";
import { runForge, type RunForgeMode, type RunForgeResult } from "@/services/forge";
import { buildForgePrompt, buildForgeSummary, type ForgePromptOptions } from "@/services/imagePrompt";
import { getForgeCost, type EdgeReason } from "@/services/edge";
import type { EagohDraft } from "@/services/eagohs";

/**
 * ForgeProvider \u2014 orchestrates the EAGOH image generation flow.
 *
 * Confirmation flow (required by the brief):
 *   1. UI calls `prepareForge(draft, mode, scope?)` \u2192 returns a `pending` preview
 *      with the final prompt, summary lines, and Edge cost.
 *   2. UI shows the preview + cost and asks the user to confirm.
 *   3. UI calls `confirmForge()` \u2192 Edge deduction + image generation + persistence.
 *   4. UI calls `cancelForge()` to dismiss the preview safely.
 *
 * The Forge screen UI is intentionally untouched \u2014 wiring is opt-in via this hook.
 */

export type ForgeMode = RunForgeMode;

export type ForgePending = {
  mode: ForgeMode;
  scope: ForgePromptOptions["scope"];
  draft: EagohDraft;
  eagohId?: string;
  prompt: string;
  summary: string[];
  edgeCost: number;
};

const edgeReasonFor = (mode: ForgeMode): EdgeReason => {
  if (mode === "initial") return "forge_initial";
  if (mode === "full_reforge") return "forge_full_reforge";
  return "forge_partial_reforge";
};

export const [ForgeProvider, useForge] = createContextHook(() => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { total: edgeTotal, spend, isMutating: isEdgeMutating } = useEdge();
  const queryClient = useQueryClient();

  const [pending, setPending] = useState<ForgePending | null>(null);
  const [lastResult, setLastResult] = useState<RunForgeResult | null>(null);

  const prepareForge = useCallback(
    (
      draft: EagohDraft,
      mode: ForgeMode,
      options: { eagohId?: string; scope?: ForgePromptOptions["scope"] } = {},
    ): ForgePending => {
      const scope: ForgePromptOptions["scope"] = options.scope ?? "full";
      const prompt = buildForgePrompt(
        {
          name: draft.name,
          sport: draft.sport,
          gender: draft.gender,
          dna: draft.dna,
          teams: draft.teams,
          appearance: draft.appearance,
          cyberneticIntensity: draft.cyberneticIntensity,
          pose: draft.pose,
          lab: draft.lab,
        },
        { scope: mode === "partial_reforge" ? scope : "full" },
      );
      const summary = buildForgeSummary({
        name: draft.name,
        sport: draft.sport,
        gender: draft.gender,
        dna: draft.dna,
        teams: draft.teams,
        appearance: draft.appearance,
        cyberneticIntensity: draft.cyberneticIntensity,
        pose: draft.pose,
        lab: draft.lab,
      });
      const edgeCost = getForgeCost(mode);
      const next: ForgePending = { mode, scope, draft, eagohId: options.eagohId, prompt, summary, edgeCost };
      setPending(next);
      return next;
    },
    [],
  );

  const cancelForge = useCallback((): void => {
    setPending(null);
  }, []);

  const confirmMutation = useMutation({
    mutationFn: async (): Promise<RunForgeResult> => {
      if (!pending) throw new Error("No forge pending confirmation.");
      if (!user?.id || !profile) throw new Error("Profile not loaded.");
      if (edgeTotal < pending.edgeCost) {
        return { ok: false, reason: "persist", error: `Insufficient Edge. Need ${pending.edgeCost}.` };
      }

      // 1) Deduct Edge first \u2014 if image gen fails downstream, the wallet still
      //    receives a recorded transaction. Caller can refund via grantSubscription.
      try {
        await spend(pending.edgeCost, edgeReasonFor(pending.mode), `Forge ${pending.mode} \u00b7 ${pending.draft.name}`);
      } catch (error) {
        return { ok: false, reason: "persist", error: error instanceof Error ? error.message : "Edge deduction failed." };
      }

      // 2) Run the image gen + persistence pipeline.
      const result = await runForge({
        userId: user.id,
        tier: profile.subscription_tier,
        mode: pending.mode,
        draft: pending.draft,
        eagohId: pending.eagohId,
        scope: pending.scope,
        edgeCost: pending.edgeCost,
      });
      return result;
    },
    onSuccess: (result) => {
      setLastResult(result);
      if (result.ok) {
        // Refresh the EAGOH list cache so the new render shows up.
        queryClient.invalidateQueries({ queryKey: ["eagohs", user?.id ?? "anon"] });
        if (pending?.eagohId) {
          queryClient.invalidateQueries({ queryKey: ["eagoh", pending.eagohId] });
        }
        setPending(null);
      }
    },
  });

  const confirmForge = useCallback((): Promise<RunForgeResult> => confirmMutation.mutateAsync(), [confirmMutation]);

  const value = useMemo(
    () => ({
      pending,
      lastResult,
      prepareForge,
      cancelForge,
      confirmForge,
      isGenerating: confirmMutation.isPending || isEdgeMutating,
      canAfford: pending ? edgeTotal >= pending.edgeCost : true,
      edgeTotal,
    }),
    [pending, lastResult, prepareForge, cancelForge, confirmForge, confirmMutation.isPending, isEdgeMutating, edgeTotal],
  );

  return value;
});
