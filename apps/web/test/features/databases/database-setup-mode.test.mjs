export function register({ assert, loadModule, readSource, test }) {
  test("setup mode waits for settled data before judging emptiness", async () => {
    const { shouldUseDatabaseSetupMode } = await loadModule(
      "/src/features/databases/views/model/database-controller-state.ts",
    )
    const emptyEditable = {
      dataSettled: true,
      editable: true,
      hasContent: false,
      setupDismissed: false,
      setupMode: false,
    }
    assert.equal(shouldUseDatabaseSetupMode(emptyEditable), true)

    // Every unloaded state must hide the dialog, even for an empty database:
    // unloaded and placeholder windows always compute hasContent === false.
    assert.equal(
      shouldUseDatabaseSetupMode({ ...emptyEditable, dataSettled: false }),
      false,
    )
  })

  test("setup mode still respects editability, dismissal, and content", async () => {
    const { shouldUseDatabaseSetupMode } = await loadModule(
      "/src/features/databases/views/model/database-controller-state.ts",
    )
    const base = {
      dataSettled: true,
      editable: true,
      hasContent: false,
      setupDismissed: false,
      setupMode: false,
    }
    assert.equal(
      shouldUseDatabaseSetupMode({ ...base, editable: false }),
      false,
    )
    assert.equal(
      shouldUseDatabaseSetupMode({ ...base, setupDismissed: true }),
      false,
    )
    assert.equal(
      shouldUseDatabaseSetupMode({ ...base, hasContent: true }),
      false,
    )
    assert.equal(
      shouldUseDatabaseSetupMode({ ...base, hasContent: true, setupMode: true }),
      true,
    )
  })

  test("controller settles setup mode on real results, not placeholders", async () => {
    const controller = await readSource(
      "/src/features/databases/views/controller/use-database-view-controller.tsx",
    )
    assert.match(controller, /dataSettled/)
    assert.match(controller, /!recordWindow\.isPlaceholderData/)
    assert.match(controller, /recordWindow\.status === "success"/)
    assert.match(controller, /bootstrapState\.status === "success"/)
  })

  test("setup prompt autofocus does not move the containing page", async () => {
    const setupCard = await readSource(
      "/src/features/databases/setup/components/database-setup-card.tsx",
    )
    const slashCommand = await readSource(
      "/src/features/editor/extensions/slash-command.tsx",
    )
    const databaseCommand = slashCommand.slice(
      slashCommand.indexOf('title: "Database"'),
    )

    assert.doesNotMatch(setupCard, /<PromptInputTextarea\s+autoFocus/)
    assert.match(
      setupCard,
      /promptInputRef\.current\?\.focus\(\{ preventScroll: true \}\)/,
    )
    assert.match(
      databaseCommand,
      /\.focus\(undefined, \{ scrollIntoView: false \}\)/,
    )
  })
}
