module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [
      // ── REQUIRED FOR iOS HERMES RELEASE COMPILATION ───────────────────────
      // Do NOT remove this plugin. It catches dynamic import() expressions that
      // survive babel-preset-expo's own transform (notably @supabase/supabase-js
      // import() calls with inline webpackIgnore/turbopackIgnore/@vite-ignore
      // comments) and converts them to Promise.resolve(require()), which Hermes
      // can compile. Removing this plugin causes the App Store release build to
      // fail with "Invalid expression encountered" on the dynamic import syntax.
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
