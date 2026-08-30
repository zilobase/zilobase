export function register({ assert, loadModule, test }) {
  test("mail cache names are scoped to origin, user, and connection", async () => {
    const { mailDatabaseName } = await loadModule(
      "/src/features/mail/cache/mail-database.ts",
    )

    assert.equal(
      mailDatabaseName({
        apiOrigin: "https://api.example.com/path",
        connectionId: "gmail-1",
        userId: "user-1",
      }),
      "zilobase:v1:https%3A%2F%2Fapi.example.com:user-1:mail:gmail-1",
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
      connectionId: "gmail-transaction",
      userId: "user-1",
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
      connectionId: "gmail-transaction",
      historyId: "10",
      key: "primary",
      lastSyncedAt: (await database.syncState.get("primary")).lastSyncedAt,
      loadedViews: { inbox: true },
      mailboxRevision: 2,
      pageTokens: { inbox: "next" },
      schemaVersion: 2,
      userId: "user-1",
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
      connectionId: "gmail-rollback",
      userId: "user-1",
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
}
