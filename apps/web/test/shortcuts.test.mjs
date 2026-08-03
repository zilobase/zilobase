export function register({ assert, loadModule, test }) {
  test("app shortcuts match Command or Control primary modifiers", async () => {
    const { matchesAppShortcut } = await loadModule(
      "/src/shortcuts/shortcut-definitions.ts"
    )
    const event = (overrides = {}) => ({
      altKey: false,
      ctrlKey: false,
      key: "z",
      metaKey: false,
      shiftKey: false,
      ...overrides,
    })

    assert.equal(
      matchesAppShortcut(event({ metaKey: true }), "undo"),
      true
    )
    assert.equal(
      matchesAppShortcut(event({ ctrlKey: true }), "undo"),
      true
    )
    assert.equal(matchesAppShortcut(event(), "undo"), false)
  })

  test("undo does not consume redo or alternate modifier chords", async () => {
    const { matchesAppShortcut } = await loadModule(
      "/src/shortcuts/shortcut-definitions.ts"
    )
    const baseEvent = {
      altKey: false,
      ctrlKey: true,
      key: "z",
      metaKey: false,
      shiftKey: false,
    }

    assert.equal(
      matchesAppShortcut(
        { ...baseEvent, shiftKey: true },
        "undo"
      ),
      false
    )
    assert.equal(
      matchesAppShortcut({ ...baseEvent, altKey: true }, "undo"),
      false
    )
    assert.equal(
      matchesAppShortcut({ ...baseEvent, key: "k" }, "openSearch"),
      true
    )
  })
}
