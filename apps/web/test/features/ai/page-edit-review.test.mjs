import { build } from "esbuild";
import { createRequire } from "node:module";

export function register({ assert, appPath, test }) {
  test("page review commands preserve statuses and editor failure handling", async () => {
    const result = await build({
      stdin: {
        contents: `
        import { createElement } from "react";
        import { renderToString } from "react-dom/server";
        import { usePageEditReview } from "./src/features/ai/conversations/effects/use-page-edit-review";
        import { runtime } from "review-test-runtime";
        export function capture(input, dependencies) {
          Object.assign(runtime, dependencies);
          let review;
          function Probe() { review = usePageEditReview(input); return null; }
          renderToString(createElement(Probe));
          return review;
        }
      `,
        resolveDir: appPath("/"),
        sourcefile: "review-test-entry.ts",
      },
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "controlled-editor",
          setup(build) {
            build.onResolve(
              {
                filter:
                  /^(review-test-runtime|sonner|@\/features\/editor\/runtime\/page-editor-registry)$|^\.\/use-page-edit-applier$/,
              },
              (args) => ({ path: args.path, namespace: "review-test" }),
            );
            build.onLoad({ filter: /.*/, namespace: "review-test" }, ({ path }) => ({
              contents:
                path === "review-test-runtime"
                  ? "export const runtime = {};"
                  : path === "sonner"
                    ? 'import { runtime } from "review-test-runtime"; export const toast = { error: (...args) => runtime.errors.push(args) };'
                    : path.includes("use-page-edit-applier")
                      ? 'import { runtime } from "review-test-runtime"; export function usePageEditApplier() { return runtime.applier; }'
                      : 'import { runtime } from "review-test-runtime"; export function usePageEditorRegistry() { return { getEditorHandle: () => runtime.editor }; }',
              loader: "ts",
            }));
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
    const before = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Before" }] }],
    };
    const after = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "After" }] }],
    };
    const calls = [],
      errors = [];
    let currentContent = before;
    const editor = {
      getContentJson: () => currentContent,
      clearEditDiffPreview: (options) => calls.push(["clear", options]),
    };
    const applier = {
      commitPageEdit: (input) => {
        calls.push(["commit", input]);
        currentContent = after;
        return { success: true };
      },
      undoPageEdit: async (input) => {
        calls.push(["undo", input]);
        return { success: true };
      },
    };
    function capture(status, dependencies = {}) {
      let messages = [
        {
          id: "snapshot",
          role: "data",
          parts: [
            {
              type: "page-edit-snapshot",
              toolCallId: "tool",
              pageId: "page",
              beforeContentJson: before,
              beforeMarkdown: "Before",
              afterMarkdown: "After",
              status,
            },
          ],
        },
      ];
      const review = module.exports.capture(
        {
          messages,
          setMessages: (update) => {
            messages = typeof update === "function" ? update(messages) : update;
          },
        },
        { editor, applier, errors, ...dependencies },
      );
      return { review, snapshot: () => messages[0].parts[0] };
    }
    const applied = capture("preview");
    await applied.review.handleApplyPageEdit("tool");
    assert.equal(applied.snapshot().status, "applied");
    assert.deepEqual(applied.snapshot().afterContentJson, after);
    assert.equal(calls[0][0], "commit");
    const undone = capture("applied");
    await undone.review.handleUndoPageEdit("tool");
    assert.equal(undone.snapshot().status, "undone");
    const declined = capture("preview");
    declined.review.handleDiscardPageEdit("tool");
    assert.equal(declined.snapshot().status, "declined");
    const stale = capture("preview");
    await stale.review.handleApplyPageEdit("tool");
    assert.equal(stale.snapshot().status, "preview");
    assert.equal(errors.at(-1)[0], "This update is no longer available");
    currentContent = before;
    const failed = capture("preview", {
      applier: {
        ...applier,
        commitPageEdit: () => ({ success: false, errorMessage: "Read only" }),
      },
    });
    await failed.review.handleApplyPageEdit("tool");
    assert.equal(failed.snapshot().status, "preview");
    assert.equal(errors.at(-1)[0], "Apply failed");
    const noEditor = capture("preview", { editor: null });
    noEditor.review.handleTogglePageEditChanges("tool");
    assert.equal(errors.at(-1)[0], "Open the page in the editor to review this change.");
  });
}
