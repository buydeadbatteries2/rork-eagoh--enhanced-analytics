/**
 * Release-safe startup instrumentation for TestFlight crash diagnosis.
 *
 * Uses console.error which survives Hermes Release builds and appears in
 * device console logs (Xcode > Window > Devices and Simulators > Open Console,
 * or Mac Console app). Every line is prefixed with [EAGOH-STARTUP] for
 * easy filtering.
 *
 * This module logs "JS_ENGINE_STARTED" immediately on import, proving the
 * Hermes JS engine began executing app code.
 */

const TAG = "[EAGOH-STARTUP]";

// Immediate log on module import — first observable JS output
console.error(`${TAG} JS_ENGINE_STARTED ${new Date().toISOString()}`);

/**
 * Log a named startup stage.
 *
 * @param stage  Human-readable stage name (e.g. "AuthProvider", "SessionRestoration")
 * @param status "start" | "success" | "failed"
 * @param err    Error object when status is "failed"
 */
export function startupLog(
  stage: string,
  status: "start" | "success" | "failed",
  err?: unknown,
): void {
  if (status === "success") {
    console.error(`${TAG} [OK] ${stage}`);
  } else if (status === "failed") {
    const errObj = err instanceof Error ? err : new Error(String(err ?? "unknown"));
    console.error(`${TAG} [FAIL] ${stage}: ${errObj.message}`);
    if (errObj.stack) {
      console.error(`${TAG} [STACK] ${stage}: ${errObj.stack}`);
    }
  } else {
    console.error(`${TAG} [START] ${stage}`);
  }
}

/**
 * Higher-order wrapper for createContextHook provider functions.
 *
 * Logs the provider name before and after the hook function runs.
 * If the hook throws during synchronous initialization (useState, useQuery
 * setup, etc.), the error is logged with the provider name and stack, then
 * rethrown — behavior is unchanged, only observability is added.
 */
export function withStartupLogging<T>(name: string, fn: () => T): () => T {
  return () => {
    try {
      startupLog(name, "start");
      const result = fn();
      startupLog(name, "success");
      return result;
    } catch (err) {
      startupLog(name, "failed", err);
      throw err;
    }
  };
}
