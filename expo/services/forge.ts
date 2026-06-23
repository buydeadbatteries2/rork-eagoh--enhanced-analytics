/**
 * EAGOH Forge orchestration service.
 *
 * Composes the four building blocks for a forge run:
 *   1. Build prompt from structured forge inputs (services/imagePrompt).
 *   2. Call the image model with transparent background (services/imageGen).
 *   3. Persist the image reference onto the EAGOH row (services/eagohs).
 *   4. Append an immutable history row (services/imageStorage).
 *
 * Edge deduction is NOT performed here \u2014 the ForgeProvider handles it via
 * the Edge wallet so the wallet stays the single source of truth.
 */

import { buildForgePrompt, type ForgePromptInput, type ForgePromptOptions } from "@/services/imagePrompt";
import { generateEagohImage, type ImageGenSize } from "@/services/imageGen";
import { logImageGeneration, type ImageGenerationMode } from "@/services/imageStorage";
import {
  createEagoh as createEagohService,
  updateEagohImage,
  updateEagohCustomizationField,
  type CreateEagohResult,
  type EagohDraft,
  type EagohRecord,
} from "@/services/eagohs";
import type { SubscriptionTier } from "@/services/profile";

export type RunForgeMode = ImageGenerationMode;

export type RunForgeInput = {
  userId: string;
  tier: SubscriptionTier;
  mode: RunForgeMode;
  draft: EagohDraft;
  /** Required for full and partial reforge \u2014 the existing EAGOH being updated. */
  eagohId?: string;
  /** Scope hint for partial reforge prompts. */
  scope?: ForgePromptOptions["scope"];
  edgeCost: number;
  size?: ImageGenSize;
};

export type RunForgeResult =
  | { ok: true; eagoh: EagohRecord; imageUrl: string; thumbUrl: string | null; prompt: string }
  | { ok: false; reason: "limit" | "image" | "persist"; error: string };

function toPromptInput(draft: EagohDraft): ForgePromptInput {
  return {
    name: draft.name,
    sport: draft.sport,
    gender: draft.gender,
    dna: draft.dna,
    teams: draft.teams,
    appearance: draft.appearance,
    cyberneticIntensity: draft.cyberneticIntensity,
    pose: draft.pose,
    lab: draft.lab,
  };
}

export async function runForge(input: RunForgeInput): Promise<RunForgeResult> {
  const promptInput = toPromptInput(input.draft);
  const prompt = buildForgePrompt(promptInput, { scope: input.mode === "partial_reforge" ? input.scope ?? "full" : "full" });

  // ---- Resolve target EAGOH (create row on initial forge) ----
  let eagoh: EagohRecord;
  if (input.mode === "initial") {
    const created: CreateEagohResult = await createEagohService(input.userId, input.tier, input.draft);
    if (!created.ok) {
      return { ok: false, reason: created.reason === "limit" ? "limit" : "persist", error: created.message };
    }
    eagoh = created.eagoh;
  } else {
    if (!input.eagohId) return { ok: false, reason: "persist", error: "Missing EAGOH id for reforge." };
    eagoh = { ...(input.draft as unknown as EagohRecord), id: input.eagohId, user_id: input.userId } as EagohRecord;
  }

  // ---- Generate image ----
  const gen = await generateEagohImage({ prompt, size: input.size ?? "1024x1536", background: "transparent" });
  if (!gen.ok) return { ok: false, reason: "image", error: gen.error };

  // ---- Persist reference ----
  try {
    const updated = await updateEagohImage(eagoh.id, {
      imageUrl: gen.imageUrl,
      thumbUrl: gen.thumbUrl,
      prompt,
    });
    eagoh = updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown persist error";
    return { ok: false, reason: "persist", error: message };
  }

  // Optional partial-reforge customization patch (best-effort).
  if (input.mode === "partial_reforge" && input.scope && input.scope !== "full" && input.scope !== "pose" && input.scope !== "cybernetic") {
    const optionId = input.draft.appearance[input.scope];
    if (optionId) {
      try {
        await updateEagohCustomizationField(eagoh.id, input.scope, optionId);
      } catch (error) {
        console.warn("[forge] customization patch failed", error instanceof Error ? error.message : "Unknown");
      }
    }
  }

  // ---- History log (fire-and-forget) ----
  void logImageGeneration({
    eagohId: eagoh.id,
    userId: input.userId,
    mode: input.mode,
    prompt,
    imageUrl: gen.imageUrl,
    thumbUrl: gen.thumbUrl,
    edgeCost: input.edgeCost,
    meta: { model: gen.model, scope: input.scope ?? "full" },
  });

  return { ok: true, eagoh, imageUrl: gen.imageUrl, thumbUrl: gen.thumbUrl, prompt };
}
