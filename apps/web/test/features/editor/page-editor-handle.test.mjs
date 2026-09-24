export function register({ assert, loadModule, test }) {
  const load = () => loadModule("/src/features/editor/runtime/page-editor-handle.ts");

  test("editor handle gates writes and reports actual applied content", async () => {
    const { createPageEditorHandle } = await load();
    const changes = [];
    let content = { type: "doc", content: [] };
    const editor = {
      getJSON: () => content,
      commands: {
        setContent: (next) => {
          content = next;
        },
      },
    };
    const denied = createPageEditorHandle({ editable: false, getEditor: () => editor });
    assert.equal(denied.setContentJson({ changed: true }), false);
    assert.equal(denied.setContentFromMarkdown("changed"), false);
    const handle = createPageEditorHandle({
      editable: true,
      getEditor: () => editor,
      onContentChange: (next) => changes.push(next),
      isSynchronized: () => false,
    });
    const next = { type: "doc", content: [{ type: "meetingBlock", attrs: { meetingId: "m1" } }] };
    assert.equal(handle.setContentJson(next), true);
    assert.deepEqual(handle.getContentJson(), next);
    assert.deepEqual(changes, [next]);
    assert.equal(handle.isSynchronized(), false);
  });

  test("editor handle follows editor readiness and current preview controls", async () => {
    const { createPageEditorHandle } = await load();
    const ref = { current: null };
    const handle = createPageEditorHandle({
      editable: true,
      getEditor: () => null,
      pageEditPreviewRef: ref,
    });
    assert.equal(handle.setContentJson({}), false);
    assert.equal(handle.setContentFromMarkdown("content"), false);
    assert.equal(handle.getContentJson(), null);
    assert.equal(handle.acceptEditDiffPreview(), false);
    assert.equal(handle.isSynchronized(), true);
    const calls = [];
    ref.current = {
      accept: () => true,
      clear: (options) => calls.push(options),
      isActive: () => true,
      show: (request) => {
        calls.push(request);
        return true;
      },
      toolCallId: () => "tool-1",
    };
    assert.equal(handle.acceptEditDiffPreview(), true);
    assert.equal(handle.isEditDiffPreviewActive(), true);
    assert.equal(handle.getActiveEditDiffToolCallId(), "tool-1");
    const request = { afterMarkdown: "next", toolCallId: "tool-1" };
    assert.equal(handle.showEditDiffPreview(request), true);
    handle.clearEditDiffPreview({ silent: true });
    assert.deepEqual(calls, [request, { silent: true }]);
  });
}
