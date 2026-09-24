export function register({ assert, loadModule, test }) {
  test("settings recovery preserves local edits through version conflicts without changing the server snapshot", async () => {
    const { recoverSettingsDraft, settingsDraftVersionChanged } = await loadModule(
      "/src/features/ai/settings/model/draft-recovery.ts",
    );
    const incoming = {
      baseVersion: 2,
      draftVersion: 4,
      version: 2,
      definition: { name: "Saved", description: "Existing" },
    };
    assert.equal(recoverSettingsDraft(incoming, null), null);
    assert.equal(recoverSettingsDraft(incoming, JSON.stringify({ patch: {} })), null);
    assert.throws(() => recoverSettingsDraft(incoming, "{"));
    const local = { baseVersion: 2, draftVersion: 4, patch: { name: "Local" } };
    const recovered = recoverSettingsDraft(incoming, JSON.stringify(local));
    assert.equal(recovered.conflict, false);
    assert.deepEqual(recovered.state.definition, {
      name: "Local",
      description: "Existing",
    });
    assert.deepEqual(recovered.patch, { name: "Local" });
    for (const mismatch of [{ baseVersion: 1 }, { draftVersion: 3 }]) {
      const result = recoverSettingsDraft(incoming, JSON.stringify({ ...local, ...mismatch }));
      assert.equal(result.conflict, true);
      assert.equal(result.state.definition.name, "Local");
    }
    assert.equal(incoming.definition.name, "Saved");
    assert.equal(settingsDraftVersionChanged(undefined, incoming), false);
    assert.equal(settingsDraftVersionChanged(incoming, { ...incoming }), false);
    assert.equal(settingsDraftVersionChanged(incoming, { ...incoming, draftVersion: 5 }), true);
    assert.equal(settingsDraftVersionChanged(incoming, { ...incoming, version: 3 }), true);
  });
}
