import { build } from "esbuild";
import { createRequire } from "node:module";
export function register({ assert, appPath, test }) {
  test("block conversion retains text only for paragraphs and headings", async () => {
    const result = await build({
      entryPoints: [appPath("/src/features/editor/commands/block-insert.ts")],
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      logLevel: "silent",
      plugins: [
        {
          name: "controlled-database-setup",
          setup(build) {
            build.onResolve({ filter: /^@\/features\/databases$/ }, () => ({
              path: "database",
              namespace: "conversion-test",
            }));
            build.onLoad({ filter: /.*/, namespace: "conversion-test" }, () => ({
              contents:
                "export const createDatabaseSetupBlockContent=()=>({type:'databaseSetupBlock'});",
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
    const { blockContentForConversion: convert } = module.exports;
    const text = { isTextblock: true, textContent: " Keep spaces " };
    assert.deepEqual(convert({ title: "Text" }, text), {
      type: "paragraph",
      content: [{ type: "text", text: " Keep spaces " }],
    });
    for (const level of [1, 2, 3])
      assert.deepEqual(convert({ title: `Heading ${level}` }, text), {
        type: "heading",
        attrs: { level },
        content: [{ type: "text", text: " Keep spaces " }],
      });
    assert.deepEqual(convert({ title: "Text" }, { ...text, textContent: "  " }), {
      type: "paragraph",
      content: undefined,
    });
    assert.deepEqual(convert({ title: "Text" }, { ...text, isTextblock: false }), {
      type: "paragraph",
      content: undefined,
    });
    assert.deepEqual(convert({ title: "Quote" }, text), {
      type: "blockquote",
      content: [{ type: "paragraph" }],
    });
    assert.deepEqual(convert({ title: "Unsupported" }, text), {
      type: "paragraph",
    });
  });
}
