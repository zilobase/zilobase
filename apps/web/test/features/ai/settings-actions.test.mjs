export function register({ assert, loadModule, test }) {
  test("settings actions distinguish read-only, draft errors, pending runs and in-flight mutations", async () => {
    const { settingsActionsVisible, settingsActionAvailability } = await loadModule(
      "/src/features/ai/settings/model/draft-actions.ts",
    );
    const draft = {
      state: { canEdit: true, pendingRun: null },
      dirty: false,
      error: null,
      publish: { isPending: false },
      discard: { isPending: false },
      createInstruction: { isPending: false },
    };
    assert.equal(settingsActionsVisible(draft, false), true);
    assert.equal(settingsActionsVisible(draft, true), false);
    assert.deepEqual(settingsActionAvailability(draft), {
      discardDisabled: true,
      saveDisabled: true,
    });
    for (const variant of [
      { ...draft, dirty: true },
      { ...draft, error: "Conflict" },
      { ...draft, state: { canEdit: true, pendingRun: {} } },
    ])
      assert.equal(settingsActionsVisible(variant, true), true);
    assert.deepEqual(settingsActionAvailability({ ...draft, error: "Conflict" }), {
      discardDisabled: false,
      saveDisabled: true,
    });
    assert.deepEqual(
      settingsActionAvailability({
        ...draft,
        state: { canEdit: true, pendingRun: {} },
      }),
      { discardDisabled: true, saveDisabled: false },
    );
    for (const action of ["publish", "discard", "createInstruction"])
      assert.deepEqual(
        settingsActionAvailability({
          ...draft,
          dirty: true,
          [action]: { isPending: true },
        }),
        { discardDisabled: true, saveDisabled: true },
      );
    for (const state of [undefined, { canEdit: false }])
      assert.equal(settingsActionsVisible({ ...draft, dirty: true, state }, false), false);
  });
  test("settings progress prioritizes AI editing, draft flush and loading", async () => {
    const { settingsProgressLabel } = await loadModule(
      "/src/features/ai/settings/model/draft-actions.ts",
    );
    assert.equal(settingsProgressLabel(true, true, false), "AI is preparing your changes…");
    assert.equal(settingsProgressLabel(false, true, false), "Preserving private draft…");
    assert.equal(settingsProgressLabel(false, false, false), "Loading settings…");
    assert.equal(settingsProgressLabel(false, false, true), "");
  });
  test("sharing controls distinguish editable state from unsaved changes", async () => {
    const { sharingActionAvailability } = await loadModule(
      "/src/features/ai/settings/model/draft-actions.ts",
    );
    const draft = {
      state: { canEdit: true },
      dirty: false,
      publish: { isPending: false },
      discard: { isPending: false },
    };
    assert.deepEqual(sharingActionAvailability(draft), {
      canEdit: true,
      actionsDisabled: true,
    });
    assert.deepEqual(sharingActionAvailability({ ...draft, dirty: true }), {
      canEdit: true,
      actionsDisabled: false,
    });
    assert.equal(sharingActionAvailability({ ...draft, state: undefined }).canEdit, false);
    for (const key of ["publish", "discard"])
      assert.deepEqual(
        sharingActionAvailability({
          ...draft,
          dirty: true,
          [key]: { isPending: true },
        }),
        { canEdit: false, actionsDisabled: true },
      );
  });
}
