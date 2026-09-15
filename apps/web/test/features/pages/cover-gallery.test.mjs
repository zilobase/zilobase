export function register({ assert, loadModule, readSource, test }) {
  test("cover gallery data URLs round-trip editable settings", async () => {
    const {
      buildCoverGalleryDataUrl,
      buildRandomCoverGalleryDataUrl,
      parseCoverGalleryDataUrl,
    } = await loadModule("/src/features/pages/images/cover-gallery.ts")
    const configs = [
      { color: "#1D4ED8", kind: "solid" },
      {
        angle: 210,
        endColor: "#F97316",
        kind: "gradient",
        startColor: "#DB2777",
        style: "linear",
      },
      {
        amplitude: 42,
        angle: 24,
        backgroundColor: "#111827",
        dotSize: 3,
        foregroundColor: "#60A5FA",
        frequency: 7,
        kind: "dither",
      },
    ]

    for (const config of configs) {
      const url = buildCoverGalleryDataUrl(config)
      assert.match(url, /^data:image\/svg\+xml;charset=utf-8,/)
      assert.deepEqual(parseCoverGalleryDataUrl(url), config)
    }

    assert.equal(parseCoverGalleryDataUrl("https://example.com/cover.png"), null)
    assert.equal(
      buildRandomCoverGalleryDataUrl(() => 0),
      buildCoverGalleryDataUrl({ color: "#1D4ED8", kind: "solid" }),
    )
    assert.equal(
      buildRandomCoverGalleryDataUrl(() => 1),
      buildCoverGalleryDataUrl({
        amplitude: 50,
        angle: 12,
        backgroundColor: "#431407",
        dotSize: 2,
        foregroundColor: "#FDBA74",
        frequency: 8,
        kind: "dither",
      }),
    )
  })

  test("cover picker provides editable gallery controls without AI creation", async () => {
    const [gallery, picker, metadata] = await Promise.all([
      readSource("/src/features/pages/images/cover-gallery-picker.tsx"),
      readSource("/src/features/pages/images/image-source-picker.tsx"),
      readSource("/src/features/databases/components/page-metadata.tsx"),
    ])

    assert.match(picker, /<TabsTrigger value="gallery">/)
    assert.match(picker, /<TabsTrigger value="upload">Upload<\/TabsTrigger>/)
    assert.doesNotMatch(picker, /Create with AI|aiImageOptions|describe your idea/i)
    assert.match(gallery, /from "@\/shared\/ui\/app-tabs"/)
    assert.match(gallery, /from "@\/shared\/ui\/button-group"/)
    assert.match(gallery, /from "@\/shared\/ui\/card"/)
    assert.match(gallery, /from "@\/shared\/ui\/field"/)
    assert.match(gallery, /from "@\/shared\/ui\/input-group"/)
    assert.match(gallery, /<TabsTrigger value="solid">Solid<\/TabsTrigger>/)
    assert.match(gallery, /<TabsTrigger value="gradient">Gradient<\/TabsTrigger>/)
    assert.match(gallery, /<TabsTrigger value="dither">Dither<\/TabsTrigger>/)
    assert.match(gallery, /const \[customizing, setCustomizing\] = useState\(false\)/)
    assert.match(gallery, /absolute right-2 top-2/)
    assert.match(gallery, /customizing \? "Presets" : "Customize"/)
    assert.match(gallery, /customizing \? \(\s*<CoverCustomizer/)
    assert.match(gallery, /Wave frequency/)
    assert.match(gallery, /Wave amplitude/)
    assert.match(gallery, /Dot size/)
    assert.doesNotMatch(gallery, /Apply cover/)
    assert.match(gallery, /onChange\(buildCoverGalleryDataUrl\(nextConfig\)\)/)
    assert.match(metadata, /Change cover/)
    assert.match(metadata, /updateCover\(buildRandomCoverGalleryDataUrl\(\)\)/)
    assert.match(metadata, /enableCoverGallery/)
    assert.match(metadata, /onGalleryChange=\{updateCover\}/)
    assert.doesNotMatch(metadata, /galleryCoverDraftRef/)
    assert.match(metadata, /initialCover=\{cover\}/)
  })
}
