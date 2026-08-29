export function register({ assert, loadModule, test }) {
  test("open-in-new-tab accepts an unmodified primary click", async () => {
    const { isOpenInNewTabShortcut } = await loadModule(
      "/src/shared/shortcuts/shortcut-definitions.ts"
    )
    const event = (overrides = {}) => ({
      altKey: false,
      button: 0,
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      ...overrides,
    })

    assert.equal(isOpenInNewTabShortcut(event()), true)
    assert.equal(isOpenInNewTabShortcut(event({ metaKey: false })), false)
    assert.equal(isOpenInNewTabShortcut(event({ button: 1 })), false)
    assert.equal(isOpenInNewTabShortcut(event({ shiftKey: true })), false)
  })

  test("app shortcuts match Command or Control primary modifiers", async () => {
    const { matchesAppShortcut } = await loadModule(
      "/src/shared/shortcuts/shortcut-definitions.ts"
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

  test("redo matches Command or Control Shift Z", async () => {
    const { matchesAppShortcut } = await loadModule(
      "/src/shared/shortcuts/shortcut-definitions.ts"
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
        "redo"
      ),
      true
    )
    assert.equal(
      matchesAppShortcut(
        { ...baseEvent, ctrlKey: false, metaKey: true, shiftKey: true },
        "redo"
      ),
      true
    )
    assert.equal(matchesAppShortcut(baseEvent, "redo"), false)
    assert.equal(
      matchesAppShortcut({ ...baseEvent, shiftKey: true }, "undo"),
      false
    )
  })

  test("shortcuts reject alternate modifier chords", async () => {
    const { matchesAppShortcut } = await loadModule(
      "/src/shared/shortcuts/shortcut-definitions.ts"
    )
    const baseEvent = {
      altKey: false,
      ctrlKey: true,
      key: "z",
      metaKey: false,
      shiftKey: false,
    }

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
