export function register({ assert, loadModule, test }) {
  test("buildColoredIconSvg stores themed icon metadata", async () => {
    const { buildColoredIconSvg, isSvgIcon, sanitizeStoredSvg } = await loadModule(
      "/src/lib/page-icon-utils.ts",
    )

    const svg = buildColoredIconSvg({
      viewBox: "0 0 24 24",
      content: '<path d="M0 0"/>',
      color: "blue",
    })

    assert.equal(isSvgIcon(svg), true)
    assert.match(svg, /fill="currentColor"/)
    assert.match(svg, /data-icon-color="blue"/)
    assert.equal(sanitizeStoredSvg(svg), svg)
  })

  test("isSvgIcon ignores emoji strings", async () => {
    const { isSvgIcon } = await loadModule("/src/lib/page-icon-utils.ts")

    assert.equal(isSvgIcon("🚀"), false)
    assert.equal(isSvgIcon('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), true)
  })

  test("sanitizeStoredSvg rejects unsafe markup", async () => {
    const { sanitizeStoredSvg } = await loadModule("/src/lib/page-icon-utils.ts")

    assert.equal(
      sanitizeStoredSvg('<svg><script>alert(1)</script></svg>'),
      "",
    )
  })

  test("getStoredIconColor reads data-icon-color", async () => {
    const { getStoredIconColor } = await loadModule("/src/lib/page-icon-utils.ts")

    assert.equal(
      getStoredIconColor(
        '<svg fill="currentColor" data-icon-color="green"><path d="M0 0"/></svg>',
      ),
      "green",
    )
    assert.equal(getStoredIconColor('<svg><path d="M0 0"/></svg>'), "default")
  })

  test("parseUploadedSvg extracts viewBox and strips fills", async () => {
    const { parseUploadedSvg } = await loadModule("/src/lib/page-icon-utils.ts")

    const parsed = parseUploadedSvg(
      '<svg viewBox="0 0 32 32"><path fill="#000" d="M0 0"/></svg>',
    )

    assert.deepEqual(parsed, {
      viewBox: "0 0 32 32",
      content: '<path d="M0 0"/>',
    })
  })
}