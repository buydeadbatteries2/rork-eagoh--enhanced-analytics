const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");
const fs = require("fs");
const path = require("path");

const config = getDefaultConfig(__dirname);

// ── REQUIRED FOR iOS HERMES RELEASE COMPILATION ───────────────────────────
// Do NOT remove the settings below. Removing them causes the App Store release
// build to fail with:
//   1) Invalid expression: _classPrivateFieldLooseBase (from @tanstack/query-core
//      legacy build — Hermes cannot parse the Babel helper).
//   2) Invalid expression: import(/* webpackIgnore: true */ ... OTEL_PKG) (from
//      @supabase/supabase-js ESM build — Hermes cannot parse dynamic import()).
// If you regenerate this file, re-apply these three settings.

// Fix 1: Enable package exports resolution. Without this, Metro falls back to
// the "main" field of @tanstack/query-core, which points to build/legacy/ and
// ships the Hermes-incompatible _classPrivateFieldLooseBase helper. The exports
// field points to build/modern/ (native #private fields), which Hermes accepts.
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ["import", "require", "default"];

// Fix 2: Ensure .mjs files are processed by Babel. @supabase/supabase-js ships
// as .mjs and contains dynamic import() expressions that must be transformed to
// Promise.resolve(require()) for Hermes.
const sourceExts = config.resolver.sourceExts ?? [];
if (!sourceExts.includes("mjs")) {
  config.resolver.sourceExts = [...sourceExts, "mjs"];
}

// Fix 3: Alias @opentelemetry/api to a no-op mock. Supabase dynamically imports
// @opentelemetry/api for trace propagation; the mock lets the dynamic require resolve.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@opentelemetry/api": path.resolve(__dirname, "polyfills/opentelemetry-mock.js"),
};

// Fix 4: Resolve the @/ TypeScript path alias used throughout the app. Without this,
// Metro cannot resolve imports like `@/constants/colors` and the release bundle fails.
const originalResolveRequest = config.resolver?.resolveRequest;
function resolveWithExtensions(basePath) {
  if (fs.existsSync(basePath)) return basePath;
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".json"]) {
    const candidate = basePath + ext;
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@/")) {
    const resolved = resolveWithExtensions(path.resolve(__dirname, moduleName.replace("@/", "")));
    if (resolved) {
      return { filePath: resolved, type: "sourceFile" };
    }
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withRorkMetro(config);
