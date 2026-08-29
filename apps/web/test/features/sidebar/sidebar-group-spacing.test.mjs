export function register({ assert, readSource, test }) {
  test("expanded sidebar sections reserve a compact gap below their final item", async () => {
    const sectionSources = [
      "/src/features/sidebar/components/ai-chats-section.tsx",
      "/src/features/sidebar/components/nav-favorites.tsx",
      "/src/features/sidebar/components/nav-pages.tsx",
    ]

    for (const path of sectionSources) {
      const source = await readSource(path)
      const spacingMatches = source.match(
        /<CollapsibleContent className="pb-4 pt-0\.5">/g,
      )

      assert.equal(
        spacingMatches?.length,
        1,
        `${path} must reserve the compact section gap after its expanded content`,
      )
    }
  })
}
