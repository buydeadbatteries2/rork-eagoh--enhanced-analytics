type Env = {
  OPENAI_API_KEY?: string;
};

type AnalystRequest = {
  prompt?: string;
  sessionType?: string;
  personality?: string;
  kind?: string;
  context?: string[];
};

type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

function getSessionInstruction(sessionType: string): string {
  if (sessionType === "oracle") return "Deliver a deep tactical read with emotionally aware risk framing. Keep it concise and premium.";
  if (sessionType === "quick-analytics") return "Deliver a short tactical analytics read with clear confidence language.";
  if (sessionType === "quick-check") return "Deliver a fast, direct signal check in three sentences or fewer. No preamble. No filler.";
  return "Deliver a balanced EAGOH analyst response with tactical intelligence, emotional awareness, and confidence caveats.";
}

function getPersonalityInstruction(personality: string): string {
  if (personality === "calm") return "Tone: composed analytical clarity, low volatility.";
  if (personality === "aggressive") return "Tone: high-intensity conviction without overpromising certainty.";
  if (personality === "oracle") return "Tone: premium oracle voice, layered, slightly cinematic, forecasts not facts.";
  if (personality === "fanatic") return "Tone: emotionally aware fanatic intelligence, loyal but honest about risk pockets.";
  return "Tone: calm tactical precision, confident clipped sentences, sharpest read first.";
}

function getKindInstruction(kind: string): string {
  if (kind === "matchup") return "Frame: matchup comparison — expose the asymmetry and surface the decisive variable.";
  if (kind === "player_confidence") return "Frame: player confidence — read momentum, fatigue, volatility, tactical fit.";
  if (kind === "team_analysis") return "Frame: team analysis — identity, pressure response, structural risk in 2–3 beats.";
  return "Frame: general signal — one tactical read with a clear confidence frame.";
}

async function handleAnalystChat(request: Request, env: Env): Promise<Response> {
  // ── API key check ──────────────────────────────────────────────────────
  if (!env.OPENAI_API_KEY) {
    console.warn("[analyst] missing OPENAI_API_KEY — returning 503");
    return jsonResponse(
      { ok: false, errorCode: "missing_api_key", error: "OpenAI API key is not configured." },
      503,
    );
  }

  // ── Parse request ──────────────────────────────────────────────────────
  let payload: AnalystRequest;
  try {
    payload = (await request.json()) as AnalystRequest;
  } catch {
    console.warn("[analyst] invalid JSON payload");
    return jsonResponse(
      { ok: false, errorCode: "invalid_request", error: "Invalid request payload." },
      400,
    );
  }

  const prompt = payload.prompt?.trim();
  if (!prompt) {
    return jsonResponse(
      { ok: false, errorCode: "invalid_request", error: "Prompt is required." },
      400,
    );
  }

  const safePrompt = prompt.slice(0, 1200);
  const sessionType = payload.sessionType ?? "standard";
  const personality = payload.personality ?? "tactical";
  const kind = payload.kind ?? "general";
  const context = payload.context?.slice(0, 6).map((item) => item.slice(0, 240)) ?? [];

  console.log("[analyst] request", {
    sessionType,
    personality,
    kind,
    promptLen: safePrompt.length,
    contextCount: context.length,
  });

  const systemContent = [
    "You are the EAGOH Analyst: intelligent, emotionally aware, tactical, premium, and futuristic.",
    "Do not claim certainty. Do not mention internal implementation or tools.",
    getSessionInstruction(sessionType),
    getPersonalityInstruction(personality),
    getKindInstruction(kind),
  ].join(" ");
  const messages: OpenAIMessage[] = [
    { role: "system", content: systemContent },
    ...context.map((item): OpenAIMessage => ({ role: "user", content: `Context signal: ${item}` })),
    { role: "user", content: safePrompt },
  ];

  // ── Call OpenAI with retry ─────────────────────────────────────────────
  const MAX_RETRIES = 3;
  let lastError: { status: number; errorCode: string; error: string } | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          temperature: sessionType === "quick-check" ? 0.55 : 0.72,
          max_tokens: sessionType === "quick-check" ? 180 : 420,
        }),
      });

      if (!openaiRes.ok) {
        const status = openaiRes.status;
        console.warn("[analyst] OpenAI non-ok response", { status, attempt });

        // Distinguish rate limits from other OpenAI errors
        if (status === 429) {
          lastError = { status, errorCode: "openai_rate_limit", error: "OpenAI rate limit exceeded." };
          if (attempt < MAX_RETRIES) {
            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            console.log("[analyst] rate limited, retrying in", { delayMs: delay, attempt });
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          return jsonResponse(
            { ok: false, errorCode: "openai_rate_limit", error: "OpenAI rate limit exceeded." },
            429,
          );
        }

        // Try to extract OpenAI error detail
        let openaiDetail = "";
        try {
          const errBody = await openaiRes.json<{ error?: { message?: string } }>();
          openaiDetail = errBody.error?.message ?? "";
        } catch {
          // ignore parse errors
        }
        console.warn("[analyst] OpenAI error detail", { detail: openaiDetail || "none" });

        return jsonResponse(
          { ok: false, errorCode: "openai_error", error: "OpenAI request failed." },
          502,
        );
      }

      const data = await openaiRes.json<{ choices?: Array<{ message?: { content?: string } }> }>();
      const reply = data.choices?.[0]?.message?.content?.trim();

      if (!reply) {
        console.warn("[analyst] OpenAI returned empty response");
        return jsonResponse(
          { ok: false, errorCode: "openai_empty_response", error: "Analyst returned an empty response." },
          502,
        );
      }

      console.log("[analyst] success", { replyLen: reply.length, attempt });
      return jsonResponse({
        ok: true,
        reply,
        model: "gpt-4o-mini",
        sessionType,
        personality,
        kind,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[analyst] fetch/parse failure", { message, attempt });

      const isTimeout =
        message.toLowerCase().includes("timeout") ||
        message.toLowerCase().includes("abort");

      lastError = {
        status: 500,
        errorCode: "openai_error",
        error: isTimeout ? "Request timed out." : "Analyst service failed safely.",
      };

      if (attempt < MAX_RETRIES && (isTimeout || message.toLowerCase().includes("network"))) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log("[analyst] network error, retrying in", { delayMs: delay, attempt });
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }

  // All retries exhausted
  return jsonResponse(lastError!, lastError!.status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/ping") {
      return jsonResponse({ ok: true, now: new Date().toISOString() });
    }

    if (url.pathname === "/analyst/chat" && request.method === "POST") {
      return handleAnalystChat(request, env);
    }

    return jsonResponse({ ok: false, error: "Not found" }, 404);
  },
};
