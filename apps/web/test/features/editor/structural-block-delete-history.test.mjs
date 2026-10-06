export function register({ assert, loadModule, readSource, test }) {
  const load = () => loadModule("/src/features/editor/operations/resource-history.ts");
  test("structural deletion awaits resource history before advancing editor history", async () => {
    const { createResourceHistoryAction } = await load();
    const events = [];
    const action = createResourceHistoryAction({
      label: "Delete structural block",
      editor: {
        canUndo: () => true,
        canRedo: () => true,
        undo: () => {
          events.push("editor:undo");
          return true;
        },
        redo: () => {
          events.push("editor:redo");
          return true;
        },
      },
      resource: {
        undo: async () => events.push("resource:undo"),
        redo: async () => events.push("resource:redo"),
      },
      onError: assert.fail,
    });
    assert.equal(await action.undo(), true);
    assert.equal(await action.redo(), true);
    assert.deepEqual(events, ["resource:undo", "editor:undo", "resource:redo", "editor:redo"]);
  });
  test("rapid structural resource transitions remain serialized", async () => {
    const { createResourceHistoryAction } = await load();
    const events = [];
    let finish;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const action = createResourceHistoryAction({
      label: "Delete structural block",
      editor: {
        canUndo: () => true,
        canRedo: () => true,
        undo: () => {
          events.push("editor:undo");
          return true;
        },
        redo: () => {
          events.push("editor:redo");
          return true;
        },
      },
      resource: {
        undo: async () => {
          events.push("resource:undo:start");
          await pending;
          events.push("resource:undo:end");
        },
        redo: async () => events.push("resource:redo"),
      },
      onError: assert.fail,
    });
    const undo = action.undo(),
      redo = action.redo();
    await Promise.resolve();
    assert.deepEqual(events, ["resource:undo:start"]);
    finish();
    await Promise.all([undo, redo]);
    assert.deepEqual(events, [
      "resource:undo:start",
      "resource:undo:end",
      "editor:undo",
      "resource:redo",
      "editor:redo",
    ]);
  });
  test("stale native receipt cancels resource history without touching another entry", async () => {
    const { createResourceHistoryAction } = await load();
    const events = [];
    let valid = false;
    const action = createResourceHistoryAction({
      label: "Delete structural block",
      editor: {
        canUndo: () => valid,
        canRedo: () => valid,
        undo: () => assert.fail("must not undo"),
        redo: () => assert.fail("must not redo"),
      },
      resource: {
        undo: async () => {
          events.push("restore");
          valid = false;
        },
        redo: async () => events.push("compensate"),
      },
      onError: assert.fail,
    });
    assert.equal(await action.undo(), false);
    assert.deepEqual(events, []);
    valid = true;
    assert.equal(await action.undo(), false);
    assert.deepEqual(events, ["restore", "compensate"]);
  });
  test("failed resource history leaves the editor unchanged", async () => {
    const { createResourceHistoryAction } = await load();
    const errors = [];
    const action = createResourceHistoryAction({
      label: "Delete structural block",
      editor: {
        canUndo: () => true,
        canRedo: () => true,
        undo: () => assert.fail("must not undo"),
        redo: () => assert.fail("must not redo"),
      },
      resource: {
        undo: async () => {
          throw new Error("denied");
        },
        redo: async () => {},
      },
      onError: (e) => errors.push(e.message),
    });
    assert.equal(await action.undo(), false);
    assert.deepEqual(errors, ["denied"]);
  });
  test("database deletion registers a captured receipt with resource restoration", async () => {
    const [menu, pane, types] = await Promise.all([
      readSource("/src/features/editor/drag-drop/drag-block-menu.tsx"),
      readSource("/src/features/pages/pane/page-editor-pane.tsx"),
      readSource("/src/features/editor/core/types.ts"),
    ]);
    assert.match(types, /Promise<StructuralBlockDeleteHistory \| void>/);
    assert.match(menu, /workspace\.history\.suppress\(deleteEditorBlock\)/);
    assert.match(menu, /workspace\.history\.capture\(editor\)/);
    assert.match(pane, /await restoreDatabase\.mutateAsync\(request\.id\)/);
  });
}
