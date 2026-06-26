/**
 * Analyst AI service layer.
 *
 * Modular, lightweight wrapper around the secure `/analyst/chat` server route.
 * Designed to scale across multiple session tiers:
 *   - Quick Check (cheap, concise, tactical) — ACTIVE
 *   - Quick Analytics (placeholder — wired later)
 *   - Standard Session (placeholder — wired later)
 *   - Deep Dive / Oracle (placeholder — wired later)
 *
 * No OpenAI key ever lives on the client. The Workers function holds the key
 * and selects the model. We only describe intent + personality from here.
 */

import { normalizeDomainId } from "./domains";

// ── Types ──────────────────────────────────────────────────────────────────

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

/** Specific error codes returned by the Cloudflare worker. */
export type AnalystErrorCode =
  | "missing_api_key"
  | "invalid_request"
  | "openai_error"
  | "openai_rate_limit"
  | "openai_empty_response"
  | "network_error"
  | "timeout"
  | "not_implemented"
  | "unknown";

export type AnalystCallError = {
  ok: false;
  /** Machine-readable error code. */
  errorCode: AnalystErrorCode;
  /** User-facing message. */
  error: string;
  /** Safe fallback reply shown when the real analyst can't respond. */
  fallback: string;
};

export type AnalystResponse = AnalystCallResult | AnalystCallError;

// ── Constants ──────────────────────────────────────────────────────────────

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

// ── User-facing error messages per error code ──────────────────────────────

const ERROR_MESSAGES: Record<AnalystErrorCode, string> = {
  missing_api_key: "OpenAI API key not configured.",
  invalid_request: "Invalid session request.",
  openai_error: "Analyst service encountered an error.",
  openai_rate_limit: "Analyst service is temporarily busy. Please try again.",
  openai_empty_response: "Analyst returned an empty response.",
  network_error: "Unable to connect to analyst service.",
  timeout: "Analyst request timed out. Please try again.",
  not_implemented: "This analyst session is coming online soon.",
  unknown: "Analyst service is temporarily unavailable.",
};

// ── Helpers ────────────────────────────────────────────────────────────────

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
 * Sanitise a prompt for logging — truncate and strip line breaks so logs stay
 * readable and never contain secrets.
 */
function sanitizeForLog(text: string): string {
  return text.slice(0, 120).replace(/\n/g, " ");
}

/**
 * Parse the worker error response into a specific AnalystErrorCode.
 * The worker returns `{ ok: false, errorCode?: string, error: string }`.
 */
function classifyWorkerError(
  httpStatus: number,
  errorCode?: string,
  errorMessage?: string,
): AnalystErrorCode {
  // Worker returns specific errorCode strings
  if (errorCode === "missing_api_key") return "missing_api_key";
  if (errorCode === "invalid_request") return "invalid_request";
  if (errorCode === "openai_rate_limit") return "openai_rate_limit";
  if (errorCode === "openai_empty_response") return "openai_empty_response";
  if (errorCode === "openai_error") return "openai_error";

  // Fall back to HTTP status heuristics
  if (httpStatus === 503) return "missing_api_key";
  if (httpStatus === 429) return "openai_rate_limit";
  if (httpStatus === 502 || httpStatus === 500) return "openai_error";
  if (httpStatus === 400) return "invalid_request";

  // Check message content
  if (errorMessage?.toLowerCase().includes("rate")) return "openai_rate_limit";
  if (errorMessage?.toLowerCase().includes("empty")) return "openai_empty_response";

  return "unknown";
}

// ── Diagnostic logger (development only) ───────────────────────────────────

let devLogId = 0;

function devLog(
  event: "request" | "response" | "error",
  details: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "production") return;
  const id = ++devLogId;
  const prefix = `[analyst:#${id}]`;
  // eslint-disable-next-line no-console
  console.log(
    `${prefix} ${event}`,
    JSON.stringify(details, null, 0),
  );
}

// ── Core call ──────────────────────────────────────────────────────────────

/**
 * Lightweight service availability check — pings the functions endpoint.
 * Returns true if the analyst backend is reachable.
 */
export async function verifyAnalystService(): Promise<{ ok: boolean; error?: string }> {
  if (!FUNCTIONS_BASE_URL) {
    return { ok: false, error: "Analyst service URL not configured." };
  }
  try {
    const res = await fetch(`${FUNCTIONS_BASE_URL}/ping`, { method: "GET" });
    const data = (await res.json()) as { ok?: boolean };
    if (res.ok && data.ok) return { ok: true };
    return { ok: false, error: `Service returned status ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: `Unable to reach analyst service: ${message}` };
  }
}

/**
 * Core analyst call. All session types route through this — only the prompt
 * shaping, personality, and budget change.
 *
 * @param eagohMeta — optional EAGOH metadata for diagnostic logging (never sent to API).
 */
async function callAnalyst(
  input: AnalystCallInput,
  eagohMeta?: { id: string; name: string; domain: string },
): Promise<AnalystResponse> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return {
      ok: false,
      errorCode: "invalid_request",
      error: "Prompt is empty.",
      fallback: localFallback(input),
    };
  }

  // Normalise domain for logging
  const normalizedDomain = eagohMeta?.domain ? normalizeDomainId(eagohMeta.domain) : "none";

  // Log request
  devLog("request", {
    eagohId: eagohMeta?.id ?? "none",
    eagohName: eagohMeta?.name ?? "none",
    eagohDomain: eagohMeta?.domain ?? "none",
    normalizedDomain,
    sessionType: input.sessionType,
    personality: input.personality ?? "tactical",
    kind: input.kind ?? "general",
    promptPreview: sanitizeForLog(prompt),
    promptLength: prompt.length,
    contextCount: input.context?.length ?? 0,
    functionsBaseUrl: FUNCTIONS_BASE_URL ? "configured" : "missing",
  });

  if (!FUNCTIONS_BASE_URL) {
    devLog("error", { reason: "missing_functions_url" });
    return {
      ok: false,
      errorCode: "network_error",
      error: ERROR_MESSAGES.network_error,
      fallback: localFallback(input),
    };
  }

  const systemHints = buildSystemHints(input);
  const fullPrompt = `${systemHints}\n\nUser question: ${prompt}`;

  const payload = {
    prompt: fullPrompt,
    sessionType: input.sessionType,
    personality: input.personality ?? "tactical",
    kind: input.kind ?? "general",
    context: input.context ?? [],
  };

  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_BASE_URL}/analyst/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (fetchError) {
    const message = fetchError instanceof Error ? fetchError.message : "Unknown fetch error";
    devLog("error", {
      reason: "network_error",
      fetchMessage: message,
      isTimeout: message.toLowerCase().includes("timeout") || message.toLowerCase().includes("abort"),
    });
    const isTimeout = message.toLowerCase().includes("timeout") || message.toLowerCase().includes("abort");
    return {
      ok: false,
      errorCode: isTimeout ? "timeout" : "network_error",
      error: isTimeout ? ERROR_MESSAGES.timeout : ERROR_MESSAGES.network_error,
      fallback: localFallback(input),
    };
  }

  // Parse response body
  let data: {
    ok?: boolean;
    reply?: string;
    model?: string;
    error?: string;
    errorCode?: string;
    status?: number;
  };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    devLog("error", {
      reason: "invalid_json_response",
      httpStatus: response.status,
    });
    return {
      ok: false,
      errorCode: "openai_error",
      error: ERROR_MESSAGES.openai_error,
      fallback: localFallback(input),
    };
  }

  // Log response
  devLog("response", {
    httpStatus: response.status,
    ok: data.ok ?? false,
    errorCode: data.errorCode ?? "none",
    error: data.error ? sanitizeForLog(data.error) : "none",
    hasReply: !!data.reply,
    model: data.model ?? "unknown",
  });

  // Handle non-ok responses — check for rate limits and retry
  if (!response.ok || !data.ok || !data.reply) {
    const code = classifyWorkerError(
      response.status,
      data.errorCode,
      data.error,
    );
    devLog("error", {
      reason: "worker_error",
      errorCode: code,
      httpStatus: response.status,
      workerError: data.error ?? "none",
    });

    return {
      ok: false,
      errorCode: code,
      error: ERROR_MESSAGES[code],
      fallback: localFallback(input),
    };
  }

  const budget = SESSION_BUDGETS[input.sessionType];
  return {
    ok: true,
    reply: data.reply.trim(),
    model: data.model ?? "gpt-4o-mini",
    sessionType: input.sessionType,
    confidence: budget.baseConfidence,
  };
}

// ── Session type wrappers ──────────────────────────────────────────────────

/** Quick Check — fast, concise, tactical. ACTIVE. */
export function runQuickCheck(args: {
  prompt: string;
  kind?: AnalystRequestKind;
  personality?: AnalystPersonality;
  context?: string[];
  eagohMeta?: { id: string; name: string; domain: string };
}): Promise<AnalystResponse> {
  return callAnalyst(
    {
      prompt: args.prompt,
      sessionType: "quick-check",
      kind: args.kind ?? "general",
      personality: args.personality ?? "tactical",
      context: args.context,
    },
    args.eagohMeta,
  );
}

/** Quick Analytics — short-form analytics tier. Reserved for future activation. */
export function runQuickAnalytics(args: {
  prompt: string;
  kind?: AnalystRequestKind;
  personality?: AnalystPersonality;
  context?: string[];
  eagohMeta?: { id: string; name: string; domain: string };
}): Promise<AnalystResponse> {
  return callAnalyst(
    {
      prompt: args.prompt,
      sessionType: "quick-analytics",
      kind: args.kind,
      personality: args.personality ?? "calm",
      context: args.context,
    },
    args.eagohMeta,
  );
}

/** Standard Session — reserved for future activation. */
export function runStandardSession(args: {
  prompt: string;
  kind?: AnalystRequestKind;
  personality?: AnalystPersonality;
  context?: string[];
  eagohMeta?: { id: string; name: string; domain: string };
}): Promise<AnalystResponse> {
  return callAnalyst(
    {
      prompt: args.prompt,
      sessionType: "standard",
      kind: args.kind,
      personality: args.personality ?? "calm",
      context: args.context,
    },
    args.eagohMeta,
  );
}

/** Deep Dive / Oracle — reserved for future activation. */
export function runDeepDive(args: {
  prompt: string;
  kind?: AnalystRequestKind;
  personality?: AnalystPersonality;
  context?: string[];
  eagohMeta?: { id: string; name: string; domain: string };
}): Promise<AnalystResponse> {
  return callAnalyst(
    {
      prompt: args.prompt,
      sessionType: "oracle",
      kind: args.kind,
      personality: args.personality ?? "oracle",
      context: args.context,
    },
    args.eagohMeta,
  );
}

export type { AnalystCallInput as AnalystInput };
