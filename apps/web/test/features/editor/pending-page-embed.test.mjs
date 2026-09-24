export function register({ assert, loadModule, test }) {
  async function setup() {
    const { Schema } = await import("@tiptap/pm/model");
    const { EditorState } = await import("@tiptap/pm/state");
    const module = await loadModule("/src/features/editor/drag-drop/pending-page-embed.ts");
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        text: { group: "inline" },
        paragraph: { group: "block", content: "inline*" },
        pageBlock: { group: "block", atom: true, attrs: { pageId: {} } },
      },
    });
    const plugin = module.createPendingPageEmbedPlugin();
    const view = {
      editable: true,
      isDestroyed: false,
      focusCount: 0,
      state: EditorState.create({
        schema,
        plugins: [plugin],
        doc: schema.node("doc", null, [
          schema.node("paragraph", null, schema.text("before")),
          schema.node("paragraph", null, schema.text("after")),
        ]),
      }),
      dispatch(tr) {
        this.state = this.state.apply(tr);
      },
      focus() {
        this.focusCount++;
      },
    };
    const errors = [];
    const pending = () => plugin.getState(view.state).find();
    const insert = (operation, pageId = "child", pos = 8) =>
      module.insertPendingPageEmbed(view, pos, pageId, "Child", operation, (error) =>
        errors.push(error),
      );
    return { view, schema, errors, pending, insert };
  }
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  };
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  test("page drop previews immediately and commits at its mapped position without stealing focus", async () => {
    const { view, pending, insert } = await setup();
    const request = deferred();
    insert(() => request.promise);
    assert.equal(pending().length, 1);
    assert.equal(view.state.doc.childCount, 2, "pending state must not enter saved content");
    view.dispatch(view.state.tr.insertText("new ", 1));
    assert.equal(pending()[0].from, 12);
    const selection = view.state.selection.from;
    request.resolve();
    await flush();
    assert.equal(pending().length, 0);
    assert.equal(view.state.doc.nodeAt(12).attrs.pageId, "child");
    assert.equal(view.state.selection.from, selection);
    assert.equal(view.focusCount, 1);
  });

  test("failed page drop removes only its preview and preserves typing and concurrent embeds", async () => {
    const { view, errors, pending, insert } = await setup();
    const first = deferred(),
      second = deferred();
    insert(() => first.promise, "first");
    insert(() => second.promise, "second");
    view.dispatch(view.state.tr.insertText("typing ", 1));
    const failure = new Error("Forbidden");
    first.reject(failure);
    await flush();
    assert.equal(pending().length, 1);
    assert.deepEqual(errors, [failure]);
    second.resolve();
    await flush();
    assert.equal(pending().length, 0);
    assert.equal(view.state.doc.child(1).attrs.pageId, "second");
    assert.equal(view.state.doc.firstChild.textContent, "typing before");
  });

  test("synchronous embed errors clear the preview", async () => {
    const { insert, pending, errors } = await setup();
    insert(() => {
      throw new Error("Failed");
    });
    await flush();
    assert.equal(pending().length, 0);
    assert.equal(errors[0].message, "Failed");
  });

  test("deleting the drop region prevents late insertion", async () => {
    const { view, insert, pending } = await setup();
    const request = deferred();
    insert(() => request.promise);
    view.dispatch(view.state.tr.delete(0, view.state.doc.content.size));
    assert.equal(pending().length, 0);
    request.resolve();
    await flush();
    assert.equal(view.state.doc.childCount, 1);
    assert.equal(view.state.doc.firstChild.type.name, "paragraph");
  });

  test("late completion does not write into destroyed or read-only editors", async () => {
    for (const flag of ["isDestroyed", "editable"]) {
      const { view, insert } = await setup();
      const request = deferred();
      insert(() => request.promise);
      view[flag] = flag === "isDestroyed";
      if (view.isDestroyed) view.dispatch = () => assert.fail("dispatch after destruction");
      request.resolve();
      await flush();
      assert.equal(view.state.doc.childCount, 2);
    }
  });
}
