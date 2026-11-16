export function register({ assert, loadModule, test }) {
  test("database icon config supports navigation and raw data source records", async () => {
    const { getDatabaseIconConfig } = await loadModule("/src/components/ui/icon-svg.ts");

    assert.deepEqual(getDatabaseIconConfig({ config: { emoji: "📣" } }), { emoji: "📣" });
    assert.deepEqual(
      getDatabaseIconConfig({
        config: { emoji: "😊" },
        dataSourceConfig: { emoji: "📝" },
      }),
      { emoji: "📝" },
    );
    assert.equal(
      getDatabaseIconConfig({
        config: { emoji: "😊" },
        dataSourceConfig: null,
      }),
      null,
    );
  });

  test("buildColoredIconSvg stores themed icon metadata", async () => {
    const { buildColoredIconSvg, isSvgIcon, sanitizeStoredSvg } = await loadModule(
      "/src/components/ui/icon-svg.ts",
    );

    const svg = buildColoredIconSvg({
      viewBox: "0 0 24 24",
      content: '<path d="M0 0"/>',
      color: "blue",
    });

    assert.equal(isSvgIcon(svg), true);
    assert.match(svg, /fill="currentColor"/);
    assert.match(svg, /data-icon-color="blue"/);
    assert.equal(sanitizeStoredSvg(svg), svg);
  });

  test("isSvgIcon ignores emoji strings", async () => {
    const { isSvgIcon } = await loadModule("/src/components/ui/icon-svg.ts");

    assert.equal(isSvgIcon("🚀"), false);
    assert.equal(isSvgIcon('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), true);
  });

  test("sanitizeStoredSvg rejects unsafe markup", async () => {
    const { sanitizeStoredSvg } = await loadModule("/src/components/ui/icon-svg.ts");

    assert.equal(sanitizeStoredSvg("<svg><script>alert(1)</script></svg>"), "");
  });

  test("getStoredIconColor reads data-icon-color", async () => {
    const { getStoredIconColor } = await loadModule("/src/components/ui/icon-svg.ts");

    assert.equal(
      getStoredIconColor('<svg fill="currentColor" data-icon-color="green"><path d="M0 0"/></svg>'),
      "green",
    );
    assert.equal(getStoredIconColor('<svg><path d="M0 0"/></svg>'), "default");
  });

  test("filled rendered icons do not inherit outline strokes", async () => {
    const { buildStoredSvgFromRenderedSvg } = await loadModule("/src/components/ui/icon-svg.ts");
    const rendered = '<svg viewBox="0 0 24 24"><path d="M2 2" fill="currentColor"/></svg>';
    const stored = buildStoredSvgFromRenderedSvg({ color: "purple", svg: rendered });

    assert.doesNotMatch(stored, /stroke=/);
    assert.match(stored, /fill="currentColor"/);

    assert.doesNotMatch(stored, /stroke=/);
    assert.doesNotMatch(stored, /stroke-width=/);
  });

  test("parseUploadedSvg extracts viewBox and strips fills", async () => {
    const { parseUploadedSvg } = await loadModule("/src/components/ui/icon-svg.ts");

    const parsed = parseUploadedSvg('<svg viewBox="0 0 32 32"><path fill="#000" d="M0 0"/></svg>');

    assert.deepEqual(parsed, {
      viewBox: "0 0 32 32",
      content: '<path d="M0 0"/>',
    });
  });

  test("Lucide stored icons keep outline strokes and their color", async () => {
    const { buildLucideIconMarkup, buildLucideStoredSvg, getStoredIconColor } = await loadModule(
      "/src/components/ui/icon-svg.ts",
    );
    const markup = buildLucideIconMarkup([
      ["circle", { cx: 11, cy: 11, r: 8, key: "a" }],
      ["path", { d: "m21 21-4.34-4.34", key: "b" }],
    ]);
    const stored = buildLucideStoredSvg({ color: "blue", markup });

    assert.equal(
      markup,
      '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.34-4.34"></path>',
    );
    assert.match(stored, /fill="none" stroke="currentColor" stroke-width="1\.75"/);
    assert.match(stored, /data-icon-library="lucide"/);
    assert.equal(getStoredIconColor(stored), "blue");
  });

  test("saved Phosphor icons convert to Lucide or fall back by drawing", async () => {
    const { isLegacyPhosphorSvg, resolveLegacyIconSvg } = await loadModule(
      "/src/components/ui/icon-svg.ts",
    );
    const pickedSearch =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" data-icon-color="purple"><path d="M168,112a56,56,0,1,1-56-56A56,56,0,0,1,168,112Zm61.66,117.66a8,8,0,0,1-11.32,0l-50.06-50.07a88,88,0,1,1,11.32-11.31l50.06,50.06A8,8,0,0,1,229.66,229.66ZM112,184a72,72,0,1,0-72-72A72.08,72.08,0,0,0,112,184Z"></path></svg>';
    const noLucideEquivalent =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor" data-icon-color="red"><path d="M208,24H168a8,8,0,0,0,0,16h20.69L163.54,65.15A64,64,0,1,0,112,175.48V192H88a8,8,0,0,0,0,16h24v24a8,8,0,0,0,16,0V208h24a8,8,0,0,0,0-16H128V175.48a63.92,63.92,0,0,0,45.84-98L200,51.31V72a8,8,0,0,0,16,0V32A8,8,0,0,0,208,24ZM120,160a48,48,0,1,1,48-48A48.05,48.05,0,0,1,120,160Z"></path></svg>';
    const uploaded =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" data-icon-color="default"><path d="M10 10h200v200z"></path></svg>';

    assert.equal(isLegacyPhosphorSvg(pickedSearch), true);
    assert.equal(isLegacyPhosphorSvg('<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>'), false);
    assert.equal(isLegacyPhosphorSvg("📣"), false);

    const converted = await resolveLegacyIconSvg(pickedSearch);
    assert.match(converted, /data-icon-library="lucide"/);
    assert.match(converted, /data-icon-color="purple"/);
    assert.match(converted, /<circle cx="11" cy="11" r="8"><\/circle>/);

    assert.equal(await resolveLegacyIconSvg(noLucideEquivalent), null);
    assert.equal(await resolveLegacyIconSvg(uploaded), uploaded);
  });
}
