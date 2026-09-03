export function register({ assert, loadModule, test }) {
  test("mail cache names are scoped to origin, user, workspace, and binding", async () => {
    const { mailDatabaseName } = await loadModule(
      "/src/features/mail/cache/mail-database.ts",
    )

    assert.equal(
      mailDatabaseName({
        apiOrigin: "https://api.example.com/path",
        bindingId: "binding-1",
        connectionId: "gmail-1",
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
      "zilobase:v2:https%3A%2F%2Fapi.example.com:user-1:workspace:workspace-1:mail:binding-1",
    )
  })

  test("mail sync commits records and its cursor atomically", async () => {
    const fake = await import("fake-indexeddb")
    globalThis.indexedDB = fake.indexedDB
    globalThis.IDBKeyRange = fake.IDBKeyRange
    const { applyMailSyncResponse, destroyMailDatabase, openMailDatabase } =
      await loadModule("/src/features/mail/cache/mail-database.ts")
    const database = await openMailDatabase({
      apiOrigin: "https://api.example.com",
      bindingId: "binding-transaction",
      connectionId: "gmail-transaction",
      userId: "user-1",
      workspaceId: "workspace-1",
    })

    const message = {
      attachmentCount: 0,
      attachments: [],
      bcc: [],
      bodyHtml: null,
      bodyText: null,
      cc: [],
      date: null,
      draftId: null,
      from: null,
      hasFullBody: false,
      historyId: "10",
      id: "message-1",
      inReplyTo: null,
      internalDate: 100,
      labelIds: ["INBOX"],
      messageIdHeader: null,
      references: [],
      replyTo: null,
      sizeEstimate: 10,
      snippet: "Preview",
      subject: "Subject",
      threadId: "thread-1",
      to: [],
    }
    await applyMailSyncResponse(database, {
      deletedMessageIds: [],
      deletedThreadIds: [],
      historyId: "10",
      labels: [],
      mailboxRevision: 2,
      messages: [message],
      mode: "full",
      nextPageToken: "next",
      threads: [{
        attachmentCount: 0,
        id: "thread-1",
        internalDate: 100,
        labelIds: ["INBOX"],
        latestMessageId: "message-1",
        messageCount: 1,
        messageIds: ["message-1"],
        participants: [],
        snippet: "Preview",
        starred: false,
        subject: "Subject",
        unread: true,
      }],
    }, "inbox")

    assert.equal((await database.messages.get("message-1"))?.subject, "Subject")
    assert.deepEqual(await database.syncState.get("primary"), {
      bindingId: "binding-transaction",
      connectionId: "gmail-transaction",
      historyId: "10",
      key: "primary",
      lastSyncedAt: (await database.syncState.get("primary")).lastSyncedAt,
      loadedViews: { inbox: true },
      mailboxRevision: 2,
      pageTokens: { inbox: "next" },
      schemaVersion: 3,
      userId: "user-1",
      workspaceId: "workspace-1",
    })

    const name = database.name
    await destroyMailDatabase(name)
  })

  test("mail cache transactions roll back all writes on failure", async () => {
    const { destroyMailDatabase, openMailDatabase } = await loadModule(
      "/src/features/mail/cache/mail-database.ts",
    )
    const database = await openMailDatabase({
      apiOrigin: "https://api.example.com",
      bindingId: "binding-rollback",
      connectionId: "gmail-rollback",
      userId: "user-1",
      workspaceId: "workspace-1",
    })
    await assert.rejects(database.transaction("rw", database.labels, async () => {
      await database.labels.put({
        color: null,
        id: "temporary",
        labelListVisibility: null,
        messageListVisibility: null,
        messagesTotal: null,
        messagesUnread: null,
        name: "Temporary",
        threadsTotal: null,
        threadsUnread: null,
        type: "user",
      })
      throw new Error("rollback")
    }), /rollback/)
    assert.equal(await database.labels.get("temporary"), undefined)
    await destroyMailDatabase(database.name)
  })

  test("mail account replacement rebuilds the workspace binding cache", async () => {
    const { destroyMailDatabase, openMailDatabase } = await loadModule(
      "/src/features/mail/cache/mail-database.ts",
    )
    const first = await openMailDatabase({
      apiOrigin: "https://replacement.example.com",
      bindingId: "binding-replacement",
      connectionId: "gmail-old",
      userId: "user-replacement",
      workspaceId: "workspace-replacement",
    })
    const oldName = first.name
    await first.labels.put({
      color: null,
      id: "Label_old",
      labelListVisibility: null,
      messageListVisibility: null,
      messagesTotal: null,
      messagesUnread: null,
      name: "Old account data",
      threadsTotal: null,
      threadsUnread: null,
      type: "user",
    })
    const next = await openMailDatabase({
      apiOrigin: "https://replacement.example.com",
      bindingId: "binding-replacement",
      connectionId: "gmail-new",
      userId: "user-replacement",
      workspaceId: "workspace-replacement",
    })
    assert.equal(next.name, oldName)
    assert.equal(await next.labels.get("Label_old"), undefined)
    await destroyMailDatabase(next.name)
  })

  test("incompatible mail cache identity is rebuilt without retaining message data", async () => {
    const { destroyMailDatabase, openMailDatabase } = await loadModule(
      "/src/features/mail/cache/mail-database.ts",
    )
    const identity = {
      apiOrigin: "https://corrupt.example.com",
      bindingId: "binding-corrupt",
      connectionId: "gmail-corrupt",
      userId: "user-corrupt",
      workspaceId: "workspace-corrupt",
    }
    const first = await openMailDatabase(identity)
    await first.syncState.update("primary", { schemaVersion: -1 })
    await first.messages.put(mutationFixture().messages[0])
    first.close()
    const rebuilt = await openMailDatabase(identity)
    assert.equal((await rebuilt.syncState.get("primary")).schemaVersion, 3)
    assert.equal(await rebuilt.messages.count(), 0)
    await destroyMailDatabase(rebuilt.name)
  })

  test("mail optimistic label changes update message and thread state and can roll back", async () => {
    const {
      applyMailSyncResponse,
      destroyMailDatabase,
      openMailDatabase,
      optimisticallyModifyMessage,
      optimisticallyModifyThread,
      restoreMailMutation,
    } = await loadModule("/src/features/mail/cache/mail-database.ts")
    const database = await openMailDatabase({
      apiOrigin: "https://api.example.com",
      bindingId: "binding-optimistic",
      connectionId: "gmail-optimistic",
      userId: "user-1",
      workspaceId: "workspace-1",
    })
    await applyMailSyncResponse(database, mutationFixture(), "inbox")

    const messageSnapshot = await optimisticallyModifyMessage(
      database,
      "message-1",
      { removeLabelIds: ["UNREAD"], addLabelIds: ["STARRED"] },
    )
    assert.equal((await database.messages.get("message-1")).labelIds.includes("UNREAD"), false)
    assert.equal((await database.threads.get("thread-1")).unread, true)
    assert.equal((await database.threads.get("thread-1")).starred, true)

    await restoreMailMutation(database, messageSnapshot)
    assert.equal((await database.messages.get("message-1")).labelIds.includes("UNREAD"), true)
    assert.equal((await database.threads.get("thread-1")).starred, false)

    await optimisticallyModifyThread(database, "thread-1", {
      addLabelIds: ["TRASH"],
      removeLabelIds: ["INBOX"],
    })
    assert.equal((await database.messages.get("message-1")).labelIds.includes("TRASH"), true)
    assert.equal((await database.messages.get("message-2")).labelIds.includes("INBOX"), false)
    await destroyMailDatabase(database.name)
  })

  test("deleting a custom label removes it from all cached records", async () => {
    const {
      applyMailSyncResponse,
      deleteMailLabelFromCache,
      destroyMailDatabase,
      openMailDatabase,
    } = await loadModule("/src/features/mail/cache/mail-database.ts")
    const database = await openMailDatabase({
      apiOrigin: "https://api.example.com",
      bindingId: "binding-label-delete",
      connectionId: "gmail-label-delete",
      userId: "user-1",
      workspaceId: "workspace-1",
    })
    const fixture = mutationFixture()
    fixture.labels = [{
      color: null,
      id: "Label_1",
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
      messagesTotal: 2,
      messagesUnread: 2,
      name: "Projects",
      threadsTotal: 1,
      threadsUnread: 1,
      type: "user",
    }]
    fixture.messages.forEach((message) => message.labelIds.push("Label_1"))
    fixture.threads[0].labelIds.push("Label_1")
    await applyMailSyncResponse(database, fixture, "inbox")
    await deleteMailLabelFromCache(database, "Label_1")

    assert.equal(await database.labels.get("Label_1"), undefined)
    assert.equal((await database.messages.get("message-1")).labelIds.includes("Label_1"), false)
    assert.equal((await database.threads.get("thread-1")).labelIds.includes("Label_1"), false)
    await destroyMailDatabase(database.name)
  })

  test("ambiguous mail mutations persist bounded reconciliation targets", async () => {
    const {
      clearMailReconciliation,
      destroyMailDatabase,
      openMailDatabase,
      queueMailReconciliation,
    } = await loadModule("/src/features/mail/cache/mail-database.ts")
    const database = await openMailDatabase({
      apiOrigin: "https://api.example.com",
      bindingId: "binding-reconciliation",
      connectionId: "gmail-reconciliation",
      userId: "user-1",
      workspaceId: "workspace-1",
    })
    await queueMailReconciliation(database, {
      messageIds: ["message-1", "message-1"],
      threadIds: ["thread-1"],
    })
    assert.deepEqual((await database.syncState.get("primary")).pendingMessageReconciliationIds, ["message-1"])
    assert.deepEqual((await database.syncState.get("primary")).pendingThreadReconciliationIds, ["thread-1"])
    await clearMailReconciliation(database, { messageId: "message-1", threadId: "thread-1" })
    assert.deepEqual((await database.syncState.get("primary")).pendingMessageReconciliationIds, [])
    assert.deepEqual((await database.syncState.get("primary")).pendingThreadReconciliationIds, [])
    await destroyMailDatabase(database.name)
  })
}

function mutationFixture() {
  const message = (id, internalDate) => ({
    attachmentCount: 0,
    attachments: [],
    bcc: [],
    bodyHtml: null,
    bodyText: "Cached body",
    cc: [],
    date: null,
    draftId: null,
    from: null,
    hasFullBody: true,
    historyId: "10",
    id,
    inReplyTo: null,
    internalDate,
    labelIds: ["INBOX", "UNREAD"],
    messageIdHeader: null,
    references: [],
    replyTo: null,
    sizeEstimate: 10,
    snippet: "Preview",
    subject: "Subject",
    threadId: "thread-1",
    to: [],
  })
  return {
    deletedMessageIds: [],
    deletedThreadIds: [],
    historyId: "10",
    labels: [],
    mailboxRevision: 2,
    messages: [message("message-1", 100), message("message-2", 200)],
    mode: "full",
    nextPageToken: null,
    threads: [{
      attachmentCount: 0,
      id: "thread-1",
      internalDate: 200,
      labelIds: ["INBOX", "UNREAD"],
      latestMessageId: "message-2",
      messageCount: 2,
      messageIds: ["message-1", "message-2"],
      participants: [],
      snippet: "Preview",
      starred: false,
      subject: "Subject",
      unread: true,
    }],
  }
}
