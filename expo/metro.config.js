const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// --- Hermes compatibility fixes for production iOS builds ---
//
// Two errors occur when Hermes compiles the JS bundle for release:
//
// 1. @tanstack/react-query ESM uses native #private fields → Hermes can't parse
// 2. @supabase/supabase-js uses dynamic import() for @opentelemetry/api → Hermes can't parse
//
// Fix 1: Disable package "exports" resolution so Metro uses the "main" field (CJS)
//        instead of "exports" field (ESM). CJS builds use transpiled helpers,
//        not native #private fields.
config.resolver.unstable_enablePackageExports = false;

// Fix 2: Map @opentelemetry/api to a no-op mock so the dynamic import() in
//        @supabase/supabase-js resolves to a static module Hermes can handle.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@opentelemetry/api": path.resolve(__dirname, "polyfills/opentelemetry-mock.js"),
};

module.exports = withRorkMetro(config);
