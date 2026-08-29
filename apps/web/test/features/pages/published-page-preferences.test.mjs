function withWindow(value, run) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window")

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value,
  })

  try {
    return run()
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "window", descriptor)
    } else {
      delete globalThis.window
    }
  }
}

export function register({ assert, loadModule, test }) {
  test("published page mode defaults safely when storage is blocked", async () => {
    const {
      readPublishedEmbeddedItemsOpenAs,
      writePublishedEmbeddedItemsOpenAs,
    } = await loadModule("/src/lib/published-page-preferences.ts")
    const blockedStorage = {
      getItem() {
        throw new Error("blocked")
      },
      setItem() {
        throw new Error("blocked")
      },
    }

    withWindow({ localStorage: blockedStorage }, () => {
      assert.equal(readPublishedEmbeddedItemsOpenAs(), "sidepanel")
      assert.doesNotThrow(() => writePublishedEmbeddedItemsOpenAs("dialog"))
    })
  })

  test("published page mode restores a stored dialog preference", async () => {
    const { readPublishedEmbeddedItemsOpenAs } = await loadModule(
      "/src/lib/published-page-preferences.ts"
    )

    withWindow(
      {
        localStorage: {
          getItem: () => "dialog",
        },
      },
      () => {
        assert.equal(readPublishedEmbeddedItemsOpenAs(), "dialog")
      }
    )
  })
}
