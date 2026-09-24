export function register({ assert, loadModule, test }) {
  test("trigger drafts retain required names, targets and custom schedule limits", async () => {
    const { canSaveSettingsTrigger } = await loadModule(
      "/src/features/ai/settings/model/trigger-draft.ts",
    );
    const draft = {
      kind: "schedule",
      cadence: "daily",
      databaseEvent: "row_added",
      propertyId: "",
      target: "",
      label: "Name",
      editingId: null,
    };
    assert.equal(canSaveSettingsTrigger(draft), true);
    assert.equal(canSaveSettingsTrigger({ ...draft, label: "  " }), false);
    for (const target of ["", "4", "NaN", "Infinity"])
      assert.equal(canSaveSettingsTrigger({ ...draft, cadence: "custom", target }), false);
    for (const target of ["5", "5.5", "60"])
      assert.equal(canSaveSettingsTrigger({ ...draft, cadence: "custom", target }), true);
    for (const kind of ["database", "meeting", "comment", "mention"]) {
      assert.equal(canSaveSettingsTrigger({ ...draft, kind }), false);
      assert.equal(canSaveSettingsTrigger({ ...draft, kind, target: "resource" }), true);
    }
    assert.equal(canSaveSettingsTrigger({ ...draft, kind: "webhook" }), true);
  });
  test("trigger materialization preserves payloads, status and append-on-edit ordering", async () => {
    const { applySettingsTriggerDraft } = await loadModule(
      "/src/features/ai/settings/model/trigger-draft.ts",
    );
    const draft = {
      kind: "schedule",
      cadence: "daily",
      databaseEvent: "property_changed",
      propertyId: "property",
      target: "resource",
      label: " Name ",
      editingId: null,
    };
    const configs = {
      schedule: { cadence: "daily" },
      database: {
        databaseId: "resource",
        event: "property_changed",
        propertyId: "property",
      },
      meeting: { meetingId: "resource" },
      comment: { pageId: "resource" },
      mention: { pageId: "resource" },
      webhook: {},
    };
    for (const [kind, config] of Object.entries(configs)) {
      const [trigger] = applySettingsTriggerDraft([], { ...draft, kind }, "new");
      assert.deepEqual(trigger.config, config);
      assert.equal(trigger.label, " Name ");
      assert.equal(trigger.status, kind === "webhook" ? "paused" : "active");
    }
    assert.deepEqual(
      applySettingsTriggerDraft([], { ...draft, cadence: "custom", target: "5.5" }, "new")[0]
        .config,
      { cadence: "custom", intervalMinutes: 5.5 },
    );
    const existing = [
      { id: "edited", status: "paused" },
      { id: "other", status: "active" },
    ];
    const result = applySettingsTriggerDraft(existing, { ...draft, editingId: "edited" }, "edited");
    assert.deepEqual(
      result.map((trigger) => trigger.id),
      ["other", "edited"],
    );
    assert.equal(result[1].status, "paused");
    assert.equal(result[0], existing[1]);
    assert.deepEqual(
      existing.map((trigger) => trigger.id),
      ["edited", "other"],
    );
  });
  test("trigger target inputs follow provider and schedule requirements", async () => {
    const { settingsTriggerTargetInput } = await loadModule(
      "/src/features/ai/settings/model/trigger-draft.ts",
    );
    assert.equal(settingsTriggerTargetInput("webhook", "custom"), null);
    assert.equal(settingsTriggerTargetInput("schedule", "daily"), null);
    assert.deepEqual(settingsTriggerTargetInput("schedule", "custom"), {
      label: "Interval in minutes",
      placeholder: "Interval in minutes (minimum 5)",
    });
    for (const kind of ["database", "comment", "mention", "meeting"])
      assert.deepEqual(settingsTriggerTargetInput(kind, "daily"), {
        label: "Resource ID",
        placeholder: "Resource ID",
      });
  });
}
