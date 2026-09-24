export function register({ assert, readSource, test }) {
  test("database column sizing cannot be overridden by inline or editor table stretching", async () => {
    const table = await readSource("/src/features/databases/styles/database-table.css");
    const inline = await readSource("/src/features/databases/styles/database.css");
    const editor = await readSource("/src/features/editor/styles/editor-chrome.css");
    const tableRule = table.match(/\.database-table\s*\{([^}]+)\}/)?.[1];
    const inlineRule = inline.match(
      /\.database-table-wrap\[data-inline-scroll="true"\] \.database-table\s*\{([^}]+)\}/,
    )?.[1];
    for (const rule of [tableRule, inlineRule]) {
      assert.ok(rule);
      assert.match(rule, /width: var\(--database-table-min-width, max-content\)/);
      assert.match(rule, /min-width: var\(--database-table-min-width, max-content\)/);
      assert.doesNotMatch(rule, /w-full|100%|--database-inline-scroll-view-width/);
    }
    assert.doesNotMatch(editor, /\.tiptap-editor table\s*\{/);
    assert.match(editor, /\.tiptap-editor table:not\(\.database-table\)\s*\{/);
  });
}
