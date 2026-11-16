export function register({ assert, loadModule, test }) {
  const loadIcons = () =>
    loadModule("/src/sections/pages/appearance/components/page-icon.tsx", [
      "getPageIconValue",
      "getDefaultPageIconValue",
      "getPageIconNode",
    ]);

  test("empty page bodies use the blank Lucide page", async () => {
    const { getPageIconValue } = await loadIcons();
    const blank = getPageIconValue({ hasContent: false });
    for (const content of [
      null,
      "",
      { type: "doc", content: [] },
      { type: "doc", content: [{ type: "paragraph" }] },
      { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "  " }] }] },
      JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
    ]) {
      assert.equal(getPageIconValue({ content }), blank);
    }
    assert.equal(getPageIconValue(), blank);
    assert.match(blank, /data-icon-library="lucide"/);
  });

  test("text and non-text content use a lined Lucide page with the same outline", async () => {
    const { getPageIconValue, getPageIconNode } = await loadIcons();
    const blank = getPageIconValue({ hasContent: false });
    const lined = getPageIconValue({ hasContent: true });
    assert.notEqual(lined, blank);
    assert.match(lined, /data-icon-library="lucide"/);
    const outlinePath = blank.match(/<path d="([^"]+)"/)[1];
    assert.ok(lined.includes(outlinePath));
    for (const node of [
      { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
      { type: "image", attrs: { src: "/image.png" } },
      { type: "databaseBlock", attrs: { databaseId: "db-1" } },
    ]) {
      const page = { content: { type: "doc", content: [node] } };
      assert.equal(getPageIconValue(page), lined);
      assert.equal(getPageIconNode(page).props.value, lined);
    }
  });

  test("page summary state controls fallback icons while custom icons take precedence", async () => {
    const { getPageIconValue } = await loadIcons();
    const page = { hasContent: false };
    const blank = getPageIconValue(page);
    page.hasContent = true;
    const lined = getPageIconValue(page);
    assert.notEqual(lined, blank);
    page.hasContent = false;
    assert.equal(getPageIconValue(page), blank);
    assert.equal(getPageIconValue({ hasContent: true, content: null }), lined);
    for (const hasContent of [true, false]) {
      for (const emoji of ["🚀", '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>']) {
        assert.equal(getPageIconValue({ hasContent, metadata: { emoji } }), emoji);
      }
    }
  });
}
