export function register({ assert, loadModule, test }) {
  test("Yjs comments converge across collaborators", async () => {
    const {
      applyCommentUpdate,
      createCommentDocument,
      createPageCommentController,
      encodeCommentState,
    } = await loadModule(
      "/src/comments/yjs-comments.ts",
    )
    const firstDocument = createCommentDocument()
    const secondDocument = createCommentDocument()
    const first = createPageCommentController({
      canEdit: true,
      canModerate: false,
      document: firstDocument,
      user: author("user-1", "One"),
    })

    const threadId = first.createPageThread("First message")
    applyCommentUpdate(secondDocument, encodeCommentState(firstDocument))
    const second = createPageCommentController({
      canEdit: true,
      canModerate: false,
      document: secondDocument,
      user: author("user-2", "Two"),
    })

    first.reply(threadId, "Reply from one")
    second.reply(threadId, "Reply from two")
    applyCommentUpdate(firstDocument, encodeCommentState(secondDocument))
    applyCommentUpdate(secondDocument, encodeCommentState(firstDocument))

    assert.deepEqual(
      first.getSnapshot().threads[0].comments.map((comment) => comment.body).sort(),
      ["First message", "Reply from one", "Reply from two"].sort(),
    )
    assert.deepEqual(first.getSnapshot().threads, second.getSnapshot().threads)
    first.destroy()
    second.destroy()
  })

  test("Yjs comment reactions aggregate and readonly controllers reject writes", async () => {
    const { createCommentDocument, createPageCommentController } = await loadModule(
      "/src/comments/yjs-comments.ts",
    )
    const document = createCommentDocument()
    const writable = createPageCommentController({
      canEdit: true,
      canModerate: false,
      document,
      user: author("user-1", "One"),
    })
    const threadId = writable.createPageThread("Hello")
    const messageId = writable.getSnapshot().threads[0].comments[0].id
    writable.addReaction(threadId, messageId, "👍")

    assert.deepEqual(
      writable.getSnapshot().threads[0].comments[0].reactions,
      [{ count: 1, emoji: "👍", reactedByMe: true }],
    )

    const readonly = createPageCommentController({
      canEdit: false,
      canModerate: false,
      document,
      user: author("viewer", "Viewer"),
    })
    assert.throws(() => readonly.reply(threadId, "No"), /read-only/)
    writable.destroy()
    readonly.destroy()
  })

  test("deleting a thread's first comment deletes the entire thread", async () => {
    const { createCommentDocument, createPageCommentController } = await loadModule(
      "/src/comments/yjs-comments.ts",
    )
    const controller = createPageCommentController({
      canEdit: true,
      canModerate: false,
      document: createCommentDocument(),
      user: author("user-1", "One"),
    })
    const threadId = controller.createPageThread("Root comment")
    const rootMessageId = controller.getSnapshot().threads[0].comments[0].id
    const replyId = controller.reply(threadId, "A reply")

    controller.deleteMessage(threadId, replyId)
    assert.deepEqual(
      controller.getSnapshot().threads[0].comments.map((comment) => comment.body),
      ["Root comment"],
    )

    controller.reply(threadId, "Another reply")
    controller.deleteMessage(threadId, rootMessageId)
    assert.deepEqual(controller.getSnapshot().threads, [])
    controller.destroy()
  })

  test("block comments anchor a range without opening the discussions sidebar", async () => {
    const { Schema } = await import("@tiptap/pm/model")
    const { EditorState } = await import("@tiptap/pm/state")
    const { createCommentDocument, createPageCommentController } = await loadModule(
      "/src/comments/yjs-comments.ts",
    )
    const schema = new Schema({
      nodes: {
        doc: { content: "block+" },
        paragraph: { content: "inline*", group: "block" },
        text: { group: "inline" },
      },
      marks: {
        comment: { attrs: { commentId: {} } },
      },
    })
    let state = EditorState.create({
      doc: schema.node("doc", null, [
        schema.node("paragraph", null, schema.text("A whole block")),
      ]),
    })
    const editor = {
      get state() {
        return state
      },
      isDestroyed: false,
      schema,
      view: {
        dispatch(transaction) {
          state = state.apply(transaction)
        },
        dom: { querySelectorAll: () => [] },
      },
    }
    const controller = createPageCommentController({
      canEdit: true,
      canModerate: false,
      document: createCommentDocument(),
      user: author("user-1", "One"),
    })
    let sidebarOpenCount = 0
    controller.setEditor(editor)
    controller.setOpenThreadHandler(() => {
      sidebarOpenCount += 1
    })

    const threadId = controller.createBlockThread("On this block", {
      from: 1,
      to: 14,
    })
    const thread = controller.getSnapshot().threads[0]

    assert.ok(threadId)
    assert.equal(thread.kind, "block")
    assert.equal(thread.quote, "A whole block")
    assert.equal(thread.anchorAttached, true)
    assert.equal(sidebarOpenCount, 0)
    assert.equal(state.doc.firstChild.firstChild.marks[0].attrs.commentId, threadId)
    controller.destroy()
  })
}

function author(id, name) {
  return { email: `${id}@example.com`, id, image: null, name }
}
