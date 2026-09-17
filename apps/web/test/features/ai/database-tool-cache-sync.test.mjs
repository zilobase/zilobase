import { build } from "esbuild";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export function register({ assert, appPath, test }) {
  test("database tool results invalidate owned caches once and retain retryable incomplete results", async () => {
    const result = await build({
      stdin: {
        contents: `
        import { QueryClient } from "@tanstack/query-core";
        import { useDatabaseToolCacheSync } from "./src/features/ai/conversations/effects/use-database-tool-cache-sync";
        import { state } from "cache-test-state";
        export const client = new QueryClient();
        state.client = client;
        export function run(messages, enabled = true) { useDatabaseToolCacheSync({ messages, enabled }); }
      `,
        resolveDir: appPath("/"),
        sourcefile: "cache-test-entry.ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "controlled-effects",
          setup(build) {
            build.onResolve(
              { filter: /^(react|@tanstack\/react-query|cache-test-state)$/ },
              (args) => ({ path: args.path, namespace: "cache-test" }),
            );
            build.onLoad(
              { filter: /.*/, namespace: "cache-test" },
              ({ path }) => ({
                contents:
                  path === "cache-test-state"
                    ? "export const state = { ref: { current: new Set() } };"
                    : path === "react"
                      ? `export * from ${JSON.stringify(require.resolve("react"))}; import { state } from "cache-test-state"; export const useEffect = run => run(); export const useRef = () => state.ref;`
                      : `export * from ${JSON.stringify(require.resolve("@tanstack/react-query"))}; import { state } from "cache-test-state"; export const useQueryClient = () => state.client;`,
                loader: "ts",
                resolveDir: appPath("/"),
              }),
            );
          },
        },
      ],
    });
    const module = { exports: {} };
    new Function("require", "module", "exports", result.outputFiles[0].text)(
      createRequire(import.meta.url),
      module,
      module.exports,
    );
    const { client, run } = module.exports;
    const part = (id, output, patch = {}) => ({
      type: "tool-createDatabase",
      toolCallId: id,
      state: "output-available",
      output,
      ...patch,
    });
    const message = (parts, role = "assistant") => ({
      id: "message",
      role,
      parts,
    });
    const calls = [];
    const databaseKey = [
      "db",
      "session",
      "database",
      "bootstrap",
      null,
      false,
    ];
    client.setQueryData(databaseKey, { loaded: true });
    const invalidate = client.invalidateQueries.bind(client);
    client.invalidateQueries = (options) => {
      calls.push(options);
      return invalidate(options);
    };
    const output = {
      ids: {
        databaseId: "database",
        relatedDatabaseId: "database",
        hostPageId: "page",
        rowPageId: "row",
        unknown: "ignored",
        pageId: "",
      },
    };
    run([message([part("disabled", output)])], false);
    run([
      message([part("user", output)], "user"),
      message([
        { type: "text", text: "hello" },
        part("pending", output, { state: "input-available" }),
        part("unrelated", output, { type: "tool-search" }),
        part("incomplete", {}),
      ]),
    ]);
    assert.deepEqual(calls, []);
    run([message([part("incomplete", output)])]);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].predicate({ queryKey: databaseKey }), true);
    assert.deepEqual(
      calls.slice(1).map(({ queryKey }) => queryKey.at(-1)),
      ["page", "row"],
    );
    const keys = [databaseKey, ...calls.slice(1).map(({ queryKey }) => [...queryKey])];
    for (const key of keys) client.setQueryData(key, { loaded: true });
    run([message([part("incomplete", output)])]);
    assert.equal(calls.length, 3);
    assert.equal(client.getQueryState(keys[0]).isInvalidated, false);
    run([message([part("second", output)])]);
    for (const key of keys)
      assert.equal(client.getQueryState(key).isInvalidated, true);
    // A synchronous subscriber may replay messages during invalidation.
    client.invalidateQueries = (options) => {
      run([message([part("reentrant", output)])]);
      return invalidate(options);
    };
    run([message([part("reentrant", output)])]);
    client.clear();
  });
}
