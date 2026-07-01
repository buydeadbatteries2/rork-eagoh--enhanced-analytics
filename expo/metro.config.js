const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");
const path = require("path");

let config = getDefaultConfig(__dirname);
config = withRorkMetro(config);

// Redirect server-side-only packages (pulled in by @rork-ai/toolkit-sdk's
// ai + @ai-sdk/react dependencies) to empty mocks so Metro stops traversing
// their dependency trees. Without this, Metro tries to bundle:
//   @ai-sdk/gateway -> @vercel/oidc (has no "main" field)
// and the iOS archive build fails with a module resolution error.
const serverMockPath = path.join(__dirname, "polyfills/server-mock.js");
const otelMockPath = path.join(__dirname, "polyfills/opentelemetry-mock.js");

const originalResolve = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    // Server-side AI SDK packages — never used in the React Native client
    if (
      moduleName === "@vercel/oidc" ||
      moduleName === "@ai-sdk/gateway"
    ) {
      return { type: "sourceFile", filePath: serverMockPath };
    }

    // @supabase/supabase-js dynamically imports @opentelemetry/api for trace
    // propagation; Hermes cannot compile dynamic import() expressions
    if (moduleName === "@opentelemetry/api") {
      return { type: "sourceFile", filePath: otelMockPath };
    }

    // Fall through to withRorkMetro's resolver (or Metro's default)
    return (originalResolve || context.resolveRequest)(
      context,
      moduleName,
      platform
    );
  },
};

module.exports = config;
