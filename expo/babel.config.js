module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [
      // ── Transform dynamic import() to Promise.resolve(require()) ──────
      // Hermes (React Native's JS engine) does not support dynamic import().
      // babel-preset-expo should handle this, but @supabase/supabase-js's .mjs
      // bundle contains import() with inline bundler-ignore comments:
      //   import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ OTEL_PKG)
      // These comments can prevent the preset's transform from recognizing the
      // expression. This plugin explicitly catches any import() survivors and
      // converts them to Promise.resolve(require()) for Hermes compatibility.
      function transformDynamicImportForHermes({ types: t }) {
        return {
          visitor: {
            CallExpression(path) {
              if (
                path.node.callee.type === "Import" &&
                path.node.arguments.length > 0
              ) {
                path.replaceWith(
                  t.callExpression(
                    t.memberExpression(
                      t.identifier("Promise"),
                      t.identifier("resolve"),
                    ),
                    [
                      t.callExpression(
                        t.identifier("require"),
                        [path.node.arguments[0]],
                      ),
                    ],
                  ),
                );
              }
            },
          },
        };
      },
    ],
  };
};
