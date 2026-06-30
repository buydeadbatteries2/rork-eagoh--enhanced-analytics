const { getDefaultConfig } = require("expo/metro-config");
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = getDefaultConfig(__dirname);

// Ensure node_modules packages with modern JS are properly transpiled
config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: true,
};

// Transpile packages that ship modern JS (private fields, dynamic imports, etc.)
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: true,
      inlineRequires: true,
    },
  }),
};

module.exports = withRorkMetro(config);
