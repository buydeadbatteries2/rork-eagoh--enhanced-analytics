/**
 * Analyst AI service layer.
 *
 * Modular, lightweight wrapper around the secure `/analyst/chat` server route.
 * Designed to scale across multiple session tiers:
 *   - Quick Check (cheap, concise, tactical)
 *   - Quick Analytics (placeholder — wired later)
 *   - Standard Session (placeholder — wired later)
 *   - Deep Dive / Oracle (placeholder — wired later)
 *
 * No OpenAI key ever lives on the client. The Workers function holds the key
 * and selects the model. We only describe intent + personality from here.
 */

export type AnalystSessionType =
  | "quick-check"
  | "quick-analytics"
  | "standard"
  | "oracle";

export type AnalystPersonality =
  | "tactical"
  | "calm"
  | "aggressive"
  | "oracle"
  | "fanatic";

export type AnalystRequestKind =
  | "matchup"
  | "player_confidence"
  | "team_analysis"
  | "general";

export type AnalystCallInput = {
  prompt: string;
  sessionType: AnalystSessionType;
  kind?: AnalystRequestKind;
  personality?: AnalystPersonality;
  context?: string[];
};

export type AnalystCallResult = {
  ok: true;
  reply: string;
  model: string;
  sessionType: AnalystSessionType;
  confidence: number;
};

export type AnalystCallError = {
  ok: false;
  error: string;
  fallback: string;
};

export type AnalystResponse = AnalystCallResult | AnalystCallError;

const FUNCTIONS_BASE_URL = process.env.EXPO_PUBLIC_RORK_FUNCTIONS_URL;

/** Edge cost range per Quick Check (1–3). */
export const QUICK_CHECK_EDGE_RANGE = { min: 1, max: 3 } as const;

/**
 * Compute the Edge cost for a Quick Check based on prompt complexity.
 * - Short prompt → 1 Edge
 * - Medium prompt → 2 Edge
 * - Long / multi-question prompt → 3 Edge
 */
export function getQuickCheckCost(prompt: string): number {
  const trimmed = prompt.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const questionMarks = (trimmed.match(/\?/g) ?? []).length;
  if (wordCount <= 12 && questionMarks <= 1) return 1;
  if (wordCount <= 30 && questionMarks <= 2) return 2;
  return 3;
}

const PERSONALITY_PRESETS: Record<AnalystPersonality, string> = {
  tactical:
    "Speak with calm tactical precision. Use confident, clipped sentences and surface the single sharpest read.",
  calm:
    "Speak with composed analytical clarity. Reduce volatility, frame risk with steady reassurance.",
  aggressive:
    "Speak with high-intensity conviction. Lead with the boldest tactical edge but never overpromise certainty.",
  oracle:
    "Speak as a premium oracle: thoughtful, layered, slightly cinematic. Frame reads as forecasts, not facts.",
  fanatic:
    "Speak with emotionally-aware fanatic intelligence — loyal to the team narrative, but honest about the risk pocket.",
};

const KIND_FRAMES: Record<AnalystRequestKind, string> = {
  matchup:
    "This is a matchup question. Compare strengths, expose the asymmetry, and surface the decisive variable.",
  player_confidence:
    "This is a player confidence question. Read momentum, fatigue, emotional volatility, and tactical fit.",
  team_analysis:
    "This is a team analysis request. Map identity, pressure response, and structural risk in two or three beats.",
  general:
    "This is a general signal question. Return one tactical read with a clear confidence frame.",
};

const SESSION_BUDGETS: Record<AnalystSessionType, { sentences: number; baseConfidence: number }> = {
  "quick-check": { sentences: 3, baseConfidence: 82 },
  "quick-analytics": { sentences: 5, baseConfidence: 86 },
  standard: { sentences: 7, baseConfidence: 89 },
  oracle: { sentences: 10, baseConfidence: 93 },
};

function buildSystemHints(input: AnalystCallInput): string {
  const personality = PERSONALITY_PRESETS[input.personality ?? "tactical"];
  const frame = KIND_FRAMES[input.kind ?? "general"];
  const budget = SESSION_BUDGETS[input.sessionType];
  const limit =
    input.sessionType === "quick-check"
      ? `Reply in no more than ${budget.sentences} short sentences. No preamble. No filler.`
      : `Reply in no more than ${budget.sentences} sentences.`;
  return [personality, frame, limit].join(" ");
}

function localFallback(input: AnalystCallInput): string {
  if (input.sessionType === "quick-check") {
    return "Fallback read: conditional edge, not a lock. Watch fatigue, lineup chemistry, and pressure response before committing Edge.";
  }
  return "Fallback read: the tactical signal is worth watching, but I'd wait for one more validation point before treating it as a true edge.";
}

/**
 * Core analyst call. All session types route through this — only the prompt
 * shaping, personality, and budget change.
 */
async function callAnalyst(input: AnalystCallInput): Promise<AnalystResponse> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return { ok: false, error: "Prompt is empty.", fallback: localFallback(input) };
  }
  if (!FUNCTIONS_BASE_URL) {
    return {
      ok: false,
      error: "Analyst link is not configured yet.",
      fallback: localFallback(input),
    };
  }

  const systemHints = buildSystemHints(input);
  const fullPrompt = `${systemHints}\n\nUser question: ${prompt}`;

  try {
    const response = await fetch(`${FUNCTIONS_BASE_URL}/analyst/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: fullPrompt,
        sessionType: input.sessionType,
        personality: input.personality ?? "tactical",
        kind: input.kind ?? "general",
        context: input.context ?? [],
      }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      reply?: string;
      model?: string;
      error?: string;
    };
    if (!response.ok || !data.ok || !data.reply) {
      throw new Error(data.error ?? `HTTP ${response.status}`);
    }
    const budget = SESSION_BUDGETS[input.sessionType];
    return {
      ok: true,
      reply: data.reply.trim(),
      model: data.model ?? "gpt-4o-mini",
      sessionType: input.sessionType,
      confidence: budget.baseConfidence,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn("[analyst] call failed safely", message);
    return {
      ok: false,
      error: "Analyst service is temporarily unavailable.",
      fallback: localFallback(input),
    };
  }
}

/** Quick Check — fast, concise, tactical. ACTIVE. */
export function runQuickCheck(args: {
  prompt: string;
  kind?: AnalystRequestKind;
  personality?: AnalystPersonality;
  context?: string[];
}): Promise<AnalystResponse> {
  return callAnalyst({
    prompt: args.prompt,
    sessionType: "quick-check",
    kind: args.kind ?? "general",
    personality: args.personality ?? "tactical",
    context: args.context,
  });
}

/** Quick Analytics — short-form analytics tier. Reserved for future activation. */
export function runQuickAnalytics(args: {
  prompt: string;
  kind?: AnalystRequestKind;
  personality?: AnalystPersonality;
  context?: string[];
}): Promise<AnalystResponse> {
  return callAnalyst({
    prompt: args.prompt,
    sessionType: "quick-analytics",
    kind: args.kind,
    personality: args.personality ?? "calm",
    context: args.context,
  });
}

/** Standard Session — reserved for future activation. */
export function runStandardSession(args: {
  prompt: string;
  kind?: AnalystRequestKind;
  personality?: AnalystPersonality;
  context?: string[];
}): Promise<AnalystResponse> {
  return callAnalyst({
    prompt: args.prompt,
    sessionType: "standard",
    kind: args.kind,
    personality: args.personality ?? "calm",
    context: args.context,
  });
}

/** Deep Dive / Oracle — reserved for future activation. */
export function runDeepDive(args: {
  prompt: string;
  kind?: AnalystRequestKind;
  personality?: AnalystPersonality;
  context?: string[];
}): Promise<AnalystResponse> {
  return callAnalyst({
    prompt: args.prompt,
    sessionType: "oracle",
    kind: args.kind,
    personality: args.personality ?? "oracle",
    context: args.context,
  });
}

export type { AnalystCallInput as AnalystInput };
