/**
 * EAGOH image generation client.
 *
 * Calls the Rork toolkit image model endpoint via the secure proxy. Returns a
 * remote URL — generation is async, so callers should treat the URL as a
 * lazy-load reference (RN's Image component handles caching natively).
 *
 * Modular and stateless. No persistence, no Edge deduction here — those are
 * orchestrated by `services/forge.ts` and `providers/ForgeProvider.tsx`.
 */

const TOOLKIT_URL = process.env.EXPO_PUBLIC_TOOLKIT_URL ?? "";
const TOOLKIT_SECRET = process.env.EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY ?? "";

export type ImageGenSize = "1024x1024" | "1024x1536" | "1536x1024";

export type ImageGenRequest = {
  prompt: string;
  /** Portrait by default for full-body EAGOH renders. */
  size?: ImageGenSize;
  /** Background mode. EAGOH renders are always transparent. */
  background?: "transparent" | "opaque";
};

export type ImageGenResult =
  | { ok: true; imageUrl: string; thumbUrl: string | null; model: string }
  | { ok: false; error: string };

/**
 * Generate a full-body EAGOH render with a transparent background.
 *
 * Uses `openai/gpt-image-2` via the Rork proxy. The toolkit returns a
 * CDN-hosted URL — we use that URL directly as the lazy-loaded reference
 * and store it in the EAGOH row (no binary upload required).
 */
export async function generateEagohImage(request: ImageGenRequest): Promise<ImageGenResult> {
  if (!TOOLKIT_URL || !TOOLKIT_SECRET) {
    return { ok: false, error: "Image generation is not configured. Toolkit key missing." };
  }

  const prompt = request.prompt?.trim();
  if (!prompt) return { ok: false, error: "Prompt is required." };

  const size = request.size ?? "1024x1536";
  const background = request.background ?? "transparent";
  const model = "openai/gpt-image-2";

  try {
    const response = await fetch(`${TOOLKIT_URL}/v3/ai/image-model`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOOLKIT_SECRET}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        size,
        background,
        // Lightweight quality default — Forge is the premium tier so we
        // request high quality only for full reforges (caller controls).
        quality: "high",
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("[imageGen] failed", { status: response.status, text: text.slice(0, 240) });
      return { ok: false, error: `Image service returned ${response.status}.` };
    }

    const data = (await response.json()) as {
      url?: string;
      imageUrl?: string;
      thumbUrl?: string;
      files?: Array<{ url?: string }>;
    };

    const imageUrl = data.url ?? data.imageUrl ?? data.files?.[0]?.url ?? null;
    if (!imageUrl) {
      return { ok: false, error: "Image service returned no URL." };
    }

    return {
      ok: true,
      imageUrl,
      thumbUrl: data.thumbUrl ?? null,
      model,
    };
  } catch (error) {
    console.warn("[imageGen] error", error instanceof Error ? error.message : "Unknown");
    return { ok: false, error: "Image generation failed. Try again." };
  }
}
