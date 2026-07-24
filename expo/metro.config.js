const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// ── Fix 1: Enable package exports resolution ────────────────────────────
// Without this, Metro uses the "main" field in package.json, which for
// @tanstack/query-core points to build/legacy/ (Babel _classPrivateFieldLooseBase
// helper that Hermes can't parse). Enabling package exports makes Metro use
// the "exports" field, which maps to build/modern/ (native #private fields).
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ["import", "require", "default"];

// ── Fix 2: Ensure .mjs files are processed by Babel ─────────────────────
// @supabase/supabase-js ships as .mjs with dynamic import() expressions.
// Metro must process these through Babel to transform import() to require().
const sourceExts = config.resolver.sourceExts ?? [];
if (!sourceExts.includes("mjs")) {
  config.resolver.sourceExts = [...sourceExts, "mjs"];
}

// ── Fix 3: Alias @opentelemetry/api to our no-op mock ───────────────────
// Supabase dynamically imports @opentelemetry/api for trace propagation.
// We provide a stub so the import resolves to a real module.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@opentelemetry/api": path.resolve(__dirname, "polyfills/opentelemetry-mock.js"),
};

module.exports = withRorkMetro(config);
