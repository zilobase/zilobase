import { build } from "esbuild";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export function register({ assert, appPath, test }) {
  test("database embeds retry unavailable editors and rejected writes, then deduplicate completed calls", async () => {
    const result = await build({
      stdin: {
        contents: `
      import {useDatabaseEmbedAutoApply} from "./src/features/ai/conversations/effects/use-database-embed-auto-apply";
      import {state} from "embed-test";
      export {state};
      export const run = (messages,enabled=true) => useDatabaseEmbedAutoApply({messages,enabled});
    `,
        resolveDir: appPath("/"),
        sourcefile: "embed-test-entry.ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "controlled-editor-lifecycle",
          setup(build) {
            build.onResolve(
              {
                filter: /^(react|embed-test|@\/features\/editor\/runtime\/page-editor-registry)$/,
              },
              (args) => ({ path: args.path, namespace: "embed-test" }),
            );
            build.onLoad({ filter: /.*/, namespace: "embed-test" }, ({ path }) => ({
              contents:
                path === "embed-test"
                  ? "export const state={ref:{current:new Set()},editor:null};"
                  : path === "react"
                    ? `export * from ${JSON.stringify(require.resolve("react"))};import {state} from "embed-test";export const useEffect=run=>run();export const useRef=()=>state.ref;`
                    : 'import {state} from "embed-test";export const usePageEditorRegistry=()=>({getEditorHandle:()=>state.editor});export const usePageEditorRegistryVersion=()=>0;',
              loader: "ts",
              resolveDir: appPath("/"),
            }));
          },
        },
      ],
    });
    const module = { exports: {} };
    new Function("require", "module", "exports", result.outputFiles[0].text)(
      require,
      module,
      module.exports,
    );
    const { run, state } = module.exports;
    const part = (id, patch = {}) => ({
      type: "tool-embedDatabaseInPage",
      toolCallId: id,
      state: "output-available",
      input: { afterHeading: "  Target  ", showTitle: true },
      output: {
        ids: {
          pageId: "page",
          databaseId: "11111111-1111-1111-1111-111111111111",
        },
        data: { showInlineDatabaseTitle: false },
      },
      ...patch,
    });
    const messages = (parts) => [{ id: "assistant", role: "assistant", parts }];
    const request = messages([part("embed")]);
    run(request);
    assert.equal(state.ref.current.size, 0);
    let editable = false,
      accept = false,
      writes = 0;
    let content = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Target" }],
        },
        { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      ],
    };
    state.editor = {
      isEditable: () => editable,
      getContentJson: () => content,
      setContentJson: (next) => {
        writes++;
        if (accept) content = next;
        return accept;
      },
    };
    run(request);
    assert.equal(writes, 0);
    editable = true;
    run(request, false);
    assert.equal(writes, 0);
    run(request);
    assert.equal(writes, 1);
    assert.equal(state.ref.current.size, 0);
    accept = true;
    run(request);
    assert.equal(writes, 2);
    assert.equal(state.ref.current.has("embed"), true);
    const block = content.content.find((node) => node.type === "databaseBlock");
    assert.equal(block.attrs.databaseId, "11111111-1111-1111-1111-111111111111");
    assert.equal(block.attrs.showTitle, false);
    run(request);
    assert.equal(writes, 2);
    run(messages([part("existing")]));
    assert.equal(writes, 2);
    assert.equal(state.ref.current.has("existing"), true);
    run(
      messages([
        part("show-title", {
          output: {
            ids: {
              pageId: "page",
              databaseId: "11111111-1111-1111-1111-111111111111",
            },
          },
        }),
      ]),
    );
    assert.equal(writes, 3);
    assert.equal(
      content.content.find((node) => node.type === "databaseBlock").attrs.showTitle,
      true,
    );
    run(
      messages([
        part("missing", { output: { ids: { pageId: "page" } } }),
        part("waiting", { state: "input-available" }),
        part("other", { type: "tool-linkDatabaseInPage" }),
      ]),
    );
    assert.equal(writes, 3);
  });
}
