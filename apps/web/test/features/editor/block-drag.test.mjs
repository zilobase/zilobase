export function register({ assert, loadModule, test }) {
  test("block drag insert pos picks before or after block midpoint", async () => {
    const { resolveBlockInsertPos } = await loadModule(
      "/src/features/editor/drag-drop/block-drag.ts",
    );

    assert.equal(resolveBlockInsertPos(10, 4, 100, 40, 110), 10);
    assert.equal(resolveBlockInsertPos(10, 4, 100, 40, 130), 14);
    assert.equal(resolveBlockInsertPos(10, 4, 100, 40, 119), 10);
  });

  test("database block drag image keeps the block anchored when dragging from the handle", async () => {
    const { getDatabaseBlockDragImagePlacement } = await loadModule(
      "/src/features/editor/drag-drop/block-drag.ts",
    );

    assert.deepEqual(getDatabaseBlockDragImagePlacement(700, 120, 744, 100), {
      offsetX: 0,
      offsetY: 20,
      paddingLeft: 44,
    });
  });

  test("database block drag image tracks the pointer inside the block", async () => {
    const { getDatabaseBlockDragImagePlacement } = await loadModule(
      "/src/features/editor/drag-drop/block-drag.ts",
    );

    assert.deepEqual(getDatabaseBlockDragImagePlacement(760, 148, 744, 100), {
      offsetX: 16,
      offsetY: 48,
      paddingLeft: 0,
    });
  });

  test("block drag payload parser rejects malformed payloads", async () => {
    const { EDITOR_BLOCK_DRAG_MIME, getDraggedEditorBlockPayload } = await loadModule(
      "/src/features/editor/drag-drop/block-drag.ts",
    );

    const dataTransfer = {
      getData: (type) =>
        type === EDITOR_BLOCK_DRAG_MIME
          ? JSON.stringify({
              editorId: "editor-1",
              node: { type: "paragraph" },
              pos: "not-a-number",
              textContent: "",
              typeName: "paragraph",
            })
          : "",
    };

    assert.equal(getDraggedEditorBlockPayload(dataTransfer), null);
  });

  test("block drag payload requires an operation and complete source slice", async () => {
    const { EDITOR_BLOCK_DRAG_MIME, getDraggedEditorBlockPayload } = await loadModule(
      "/src/features/editor/drag-drop/block-drag-session.ts",
    );
    const payload = {
      operationId: "operation",
      editorId: "view",
      pos: 0,
      from: 0,
      to: 3,
      blockCount: 1,
      node: { type: "paragraph" },
      slice: { content: [{ type: "paragraph" }] },
      parentTypeName: "doc",
      textContent: "A",
      typeName: "paragraph",
    };
    const transfer = (value) => ({
      getData: (type) => (type === EDITOR_BLOCK_DRAG_MIME ? JSON.stringify(value) : ""),
    });
    assert.deepEqual(getDraggedEditorBlockPayload(transfer(payload)), payload);
    assert.equal(
      getDraggedEditorBlockPayload(transfer({ ...payload, operationId: undefined })),
      null,
    );
    assert.equal(getDraggedEditorBlockPayload(transfer({ ...payload, to: 0 })), null);
    assert.equal(getDraggedEditorBlockPayload(null), null);
  });
  test("database cycle checks distinguish host and ancestor placements", async () => {
    const { canMoveDatabaseBlockToPage } = await loadModule(
      "/src/features/editor/drag-drop/block-drag-session.ts",
    );
    assert.equal(canMoveDatabaseBlockToPage("a", "a", []), false);
    assert.equal(canMoveDatabaseBlockToPage("a", "b", ["a"]), false);
    assert.equal(canMoveDatabaseBlockToPage("a", "b", []), true);
  });
}
