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
  if (!env.OPENAI_API_KEY) {
    return jsonResponse({ ok: false, error: "OpenAI key is not configured yet." }, 503);
  }

  let payload: AnalystRequest;
  try {
    payload = (await request.json()) as AnalystRequest;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request payload." }, 400);
  }

  const prompt = payload.prompt?.trim();
  if (!prompt) {
    return jsonResponse({ ok: false, error: "Prompt is required." }, 400);
  }

  const safePrompt = prompt.slice(0, 1200);
  const sessionType = payload.sessionType ?? "standard";
  const personality = payload.personality ?? "tactical";
  const kind = payload.kind ?? "general";
  const context = payload.context?.slice(0, 6).map((item) => item.slice(0, 240)) ?? [];
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

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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

    if (!response.ok) {
      const status = response.status;
      console.warn("OpenAI request failed", { status });
      return jsonResponse({ ok: false, error: "Analyst service is temporarily unavailable." }, 502);
    }

    const data = await response.json<{ choices?: Array<{ message?: { content?: string } }> }>();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return jsonResponse({ ok: false, error: "Analyst returned an empty response." }, 502);
    }

    return jsonResponse({ ok: true, reply, model: "gpt-4o-mini", sessionType, personality, kind });
  } catch (error) {
    console.error("Analyst chat failure", error instanceof Error ? error.message : "Unknown error");
    return jsonResponse({ ok: false, error: "Analyst service failed safely." }, 500);
  }
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
