import { build } from "esbuild";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export function register({ assert, appPath, test }) {
  test("automatic page edits preserve preview, failure, validation and replay semantics", async () => {
    const result = await build({
      stdin: {
        contents: `
        import { usePageEditAutoApply } from "./src/features/ai/conversations/effects/use-page-edit-auto-apply";
        import { state } from "auto-edit-test";
        export function create(result) {
          state.processed = { current: new Set() }; state.result = result;
          state.calls = []; state.messages = []; state.applying = [];
          return { state, run(messages, enabled = true) {
            state.messages = messages;
            usePageEditAutoApply({ enabled, messages, getContextPageMarkdown: () => "context", setMessages: update => { state.messages = update(state.messages); } });
            return state.messages;
          }};
        }
      `,
        resolveDir: appPath("/"),
        sourcefile: "auto-edit-entry.ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "controlled-edit-effects",
          setup(build) {
            build.onResolve(
              {
                filter:
                  /^(react|auto-edit-test|@\/features\/editor\/runtime\/page-editor-registry)$|^\.\/use-page-edit-applier$/,
              },
              (args) => ({ path: args.path, namespace: "auto-edit" }),
            );
            build.onLoad({ filter: /.*/, namespace: "auto-edit" }, ({ path }) => ({
              contents:
                path === "auto-edit-test"
                  ? "export const state = {};"
                  : path === "react"
                    ? `export * from ${JSON.stringify(require.resolve("react"))}; import { state } from "auto-edit-test"; export const useRef = () => state.processed; export const useEffect = run => run(); export const useState = () => [state.applying, update => { state.applying = update(state.applying); }];`
                    : path.includes("use-page-edit-applier")
                      ? 'import { state } from "auto-edit-test"; export const usePageEditApplier = () => ({ resolvePageEdit: input => { state.calls.push(input); return state.result; } });'
                      : 'export const usePageEditorRegistry = () => ({ getEditorHandle: () => ({ getContentJson: () => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Current" }] }] }) }) });',
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
    const output = { pageId: "page", summary: "Edit", afterMarkdown: "After" };
    const part = (id, value = output, patch = {}) => ({
      type: "tool-proposePageContentUpdate",
      toolCallId: id,
      state: "output-available",
      output: value,
      ...patch,
    });
    const message = (parts, role = "assistant") => ({
      id: "assistant",
      role,
      parts,
    });
    const success = {
      success: true,
      beforeMarkdown: "Before",
      afterMarkdown: "After",
      beforeContentJson: { type: "doc" },
    };
    const { create } = module.exports;
    const preview = create(success);
    preview.run([message([part("disabled")])], false);
    assert.equal(preview.state.calls.length, 0);
    const messages = preview.run([
      message([
        part("full"),
        part("patch", {
          ...output,
          searchText: "Before",
          replaceText: "After",
        }),
      ]),
    ]);
    assert.deepEqual(
      preview.state.calls.map((input) => input.editMode),
      ["full", "patch"],
    );
    assert.equal(preview.state.calls[0].contextPageMarkdown, "context");
    assert.deepEqual(
      messages.slice(1).map((item) => item.parts[0].status),
      ["preview", "preview"],
    );
    assert.equal(messages[1].parts[0].parentMessageId, "assistant");
    assert.deepEqual(preview.state.applying, []);
    preview.run(messages);
    assert.equal(preview.state.calls.length, 2);
    const invalid = create(success);
    invalid.run([
      message([
        part("missing", {}),
        part("empty-full", { ...output, afterMarkdown: " " }),
        part("empty-patch", { ...output, editMode: "patch", searchText: " " }),
        part("no-mode", { pageId: "page" }),
        part("waiting", output, { state: "input-available" }),
        part("error", output, { state: "output-error", errorText: "Failed" }),
        part("other", output, { type: "tool-search" }),
      ]),
    ]);
    assert.equal(invalid.state.calls.length, 0);
    invalid.run([message([part("missing"), part("waiting")])]);
    assert.equal(invalid.state.calls.length, 1);
    const failed = create({ success: false, errorMessage: "Read only" });
    const failure = failed.run([
      message([
        part("failure", {
          ...output,
          afterMarkdown: undefined,
          searchText: "Before",
          replaceText: "Replacement",
        }),
      ]),
    ])[1].parts[0];
    assert.equal(failure.status, "failed");
    assert.equal(failure.errorMessage, "Read only");
    assert.equal(failure.afterMarkdown, "Replacement");
    assert.equal(failure.beforeContentJson, null);
    const stale = create({
      success: false,
      errorMessage:
        "Could not find the requested section in the page. Copy searchText verbatim from the page content.",
    });
    const declined = stale.run([
      message([part("stale", { ...output, afterMarkdown: "  Updated  " })]),
    ])[1].parts[0];
    assert.equal(declined.status, "declined");
    assert.equal(declined.beforeMarkdown, "Current");
    assert.equal(declined.afterMarkdown, "Updated");
    const existing = create(success);
    existing.run([message([part("full")]), messages[1]]);
    assert.equal(existing.state.calls.length, 0);
  });
}
