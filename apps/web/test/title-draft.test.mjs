export function register({ assert, loadModule, test }) {
  test("title drafts retain spaces across stale source updates", async () => {
    const { reduceTitleDraft } = await loadModule(
      "/src/hooks/use-title-draft.ts",
    )
    const saved = {
      dirty: false,
      sourceId: "page-1",
      value: "Hello",
    }
    const withSpace = reduceTitleDraft(saved, {
      type: "edit",
      value: "Hello ",
    })

    assert.deepEqual(
      reduceTitleDraft(withSpace, {
        sourceId: "page-1",
        title: "Hello",
        type: "source",
      }),
      {
        dirty: true,
        sourceId: "page-1",
        value: "Hello ",
      },
    )
  })

  test("stale title save acknowledgements do not replace newer typing", async () => {
    const { reduceTitleDraft } = await loadModule(
      "/src/hooks/use-title-draft.ts",
    )
    const current = {
      dirty: true,
      sourceId: "page-1",
      value: "Hello world",
    }

    assert.deepEqual(
      reduceTitleDraft(current, {
        draft: "Hello",
        sourceId: "page-1",
        title: "Hello",
        type: "saved",
      }),
      current,
    )
  })

  test("the latest title save cleans and normalizes its matching draft", async () => {
    const { reduceTitleDraft } = await loadModule(
      "/src/hooks/use-title-draft.ts",
    )

    assert.deepEqual(
      reduceTitleDraft(
        {
          dirty: true,
          sourceId: "page-1",
          value: "  Hello world  ",
        },
        {
          draft: "  Hello world  ",
          sourceId: "page-1",
          title: "Hello world",
          type: "saved",
        },
      ),
      {
        dirty: false,
        sourceId: "page-1",
        value: "Hello world",
      },
    )
  })

  test("title drafts reset when the edited source changes", async () => {
    const { reduceTitleDraft } = await loadModule(
      "/src/hooks/use-title-draft.ts",
    )

    assert.deepEqual(
      reduceTitleDraft(
        {
          dirty: true,
          sourceId: "page-1",
          value: "Unsaved title",
        },
        {
          sourceId: "page-2",
          title: "Second page",
          type: "source",
        },
      ),
      {
        dirty: false,
        sourceId: "page-2",
        value: "Second page",
      },
    )
  })
}
