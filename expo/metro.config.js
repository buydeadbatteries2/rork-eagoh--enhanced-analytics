const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");
const path = require("path");

const defaultConfig = getDefaultConfig(__dirname);

/**
 * Custom resolver that forces CJS entries for packages that publish ESM with
 * syntax Hermes cannot compile (dynamic import(), native #private fields, etc).
 *
 * Hermes (React Native's JS engine) does NOT support:
 * - Dynamic import() expressions
 * - Native #private class fields (they get transformed but Babel helper
 *   resolution can break across ESM/CJS boundaries)
 *
 * Expo SDK 54 enables unstable_enablePackageExports which prefers the "import"
 * condition in package.json exports, causing Metro to bundle ESM files that
 * Hermes cannot process.
 */
const PROJECT_ROOT = __dirname;

function resolveSupabaseToCjs(context, moduleName) {
  // @supabase/supabase-js main entry
  if (moduleName === "@supabase/supabase-js") {
    return path.resolve(
      PROJECT_ROOT,
      "node_modules/@supabase/supabase-js/dist/index.cjs"
    );
  }
  // @supabase/* sub-packages
  if (moduleName.startsWith("@supabase/")) {
    // Extract the sub-package name for resolution through Metro's default
    // resolver (which will handle mainFields etc.)
    return null; // let default resolution handle it
  }
  return null;
}

function resolveTanstackToLegacy(context, moduleName) {
  // @tanstack/query-core
  if (moduleName === "@tanstack/query-core") {
    return path.resolve(
      PROJECT_ROOT,
      "node_modules/@tanstack/query-core/build/legacy/index.cjs"
    );
  }
  // @tanstack/react-query
  if (moduleName === "@tanstack/react-query") {
    return path.resolve(
      PROJECT_ROOT,
      "node_modules/@tanstack/react-query/build/legacy/index.cjs"
    );
  }
  return null;
}

// Custom resolveRequest — runs before the default resolver.
// withRorkMetro will capture this and call it as a fallback after its own
// custom resolution (haptics, maps, etc.).
defaultConfig.resolver = {
  ...defaultConfig.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // ── @opentelemetry/api → no-op mock ──────────────────────────────
    // supabase-js tries to dynamically import this for trace propagation.
    // Hermes cannot compile dynamic import(). Provide a stub instead.
    if (moduleName === "@opentelemetry/api") {
      return {
        filePath: path.resolve(PROJECT_ROOT, "polyfills/opentelemetry-mock.js"),
        type: "sourceFile",
      };
    }

    // ── @supabase/supabase-js → force CJS ────────────────────────────
    // ESM entry (dist/index.mjs) uses import("@opentelemetry/api") which
    // Hermes cannot compile. CJS entry uses require() which works fine.
    const supabaseCjs = resolveSupabaseToCjs(context, moduleName);
    if (supabaseCjs) {
      return { filePath: supabaseCjs, type: "sourceFile" };
    }

    // ── @tanstack/* → force legacy CJS ───────────────────────────────
    // Modern builds use native #private fields. Babel transforms these
    // into _classPrivateFieldLooseBase helpers, but the helper import
    // can resolve incorrectly across ESM/CJS boundaries in Hermes.
    // Legacy CJS builds use _classCallCheck etc. which work reliably.
    const tanstackLegacy = resolveTanstackToLegacy(context, moduleName);
    if (tanstackLegacy) {
      return { filePath: tanstackLegacy, type: "sourceFile" };
    }

    // ── Fall through to default Metro resolution ─────────────────────
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = withRorkMetro(defaultConfig);
