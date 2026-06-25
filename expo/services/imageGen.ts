/**
 * EAGOH image generation client.
 *
 * Calls the Rork Toolkit V2 proxy which forwards to Vercel AI Gateway
 * for image-only models (`type: "image"`). Returns a base64 data URI
 * that can be used directly in React Native's <Image> component and
 * stored in the EAGOH row.
 *
 * Modular and stateless. No persistence, no Edge deduction here — those
 * are orchestrated by `services/forge.ts` and `providers/ForgeProvider.tsx`.
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
 * Uses `openai/gpt-image-1.5` via the Rork proxy — gpt-image-1.5 is the
 * only OpenAI image model that supports transparent (alpha) PNG output.
 * The Vercel AI Gateway v3 image-model endpoint returns base64-encoded
 * images; we wrap them in a data URI for direct use in React Native.
 *
 * Endpoint: POST /v2/vercel/v3/ai/image-model
 * Proxy: ${TOOLKIT_URL}/v2/vercel/v3/ai/image-model
 */
export async function generateEagohImage(request: ImageGenRequest): Promise<ImageGenResult> {
  if (!TOOLKIT_URL || !TOOLKIT_SECRET) {
    return { ok: false, error: "Image generation is not configured. Toolkit key missing." };
  }

  const prompt = request.prompt?.trim();
  if (!prompt) return { ok: false, error: "Prompt is required." };

  const size = request.size ?? "1024x1536";
  const background = request.background ?? "transparent";

  // gpt-image-1.5 is required for transparent background support.
  // gpt-image-2 does not support alpha PNG output.
  const model = background === "transparent" ? "openai/gpt-image-1.5" : "openai/gpt-image-2";

  // Provider-specific options. For transparent backgrounds with OpenAI
  // models, the background flag lives inside providerOptions.openai.
  const providerOptions: Record<string, unknown> = {};
  if (background === "transparent") {
    providerOptions.openai = { background: "transparent" };
  }

  try {
    const response = await fetch(`${TOOLKIT_URL}/v2/vercel/v3/ai/image-model`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOOLKIT_SECRET}`,
        // Vercel AI Gateway v3 required protocol headers
        "ai-gateway-protocol-version": "0.0.1",
        "ai-image-model-specification-version": "4",
        "ai-model-id": model,
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size,
        providerOptions,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("[imageGen] failed", { status: response.status, text: text.slice(0, 240) });
      return { ok: false, error: `Image service returned ${response.status}.` };
    }

    const data = (await response.json()) as {
      images?: string[];
      warnings?: unknown[];
    };

    // The v3 image-model endpoint returns base64 strings in `images[]`.
    const base64 = data.images?.[0];
    if (!base64) {
      return { ok: false, error: "Image service returned no image data." };
    }

    // Wrap in a data URI so React Native's <Image> can display it directly.
    const imageUrl = `data:image/png;base64,${base64}`;

    return {
      ok: true,
      imageUrl,
      thumbUrl: imageUrl, // same base64 — tiny thumbnail generation would be a separate step
      model,
    };
  } catch (error) {
    console.warn("[imageGen] error", error instanceof Error ? error.message : "Unknown");
    return { ok: false, error: "Image generation failed. Try again." };
  }
}
