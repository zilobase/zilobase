export function register({ assert, loadModule, readSource, test }) {
  test("mail reply helpers preserve Gmail threading and filter the connected account from reply-all", async () => {
    const { forwardSeed, replySeed } = await loadModule("/src/features/mail/model/mail-compose.ts")
    const message = {
      bodyText: "Original body",
      cc: [{ address: "team@example.com", name: "Team" }],
      date: "Sun, 30 Aug 2026 10:00:00 +0000",
      from: { address: "sender@example.com", name: "Sender" },
      inReplyTo: null,
      internalDate: 1,
      messageIdHeader: "<message@example.com>",
      references: ["<root@example.com>"],
      replyTo: null,
      snippet: "Original",
      subject: "Project",
      threadId: "thread-1",
      to: [{ address: "me@example.com", name: null }],
    }
    const reply = replySeed(message, "me@example.com", true)
    assert.equal(reply.subject, "Re: Project")
    assert.equal(reply.threadId, "thread-1")
    assert.deepEqual(reply.references, ["<root@example.com>", "<message@example.com>"])
    assert.deepEqual(reply.cc, [{ address: "team@example.com", name: "Team" }])
    assert.equal(forwardSeed(message).subject, "Fwd: Project")
  })

  test("the composer auto-saves online drafts and never creates an offline outbox", async () => {
    const source = await readSource("/src/features/mail/components/mail-composer.tsx")
    assert.match(source, /setTimeout\([^]*1_200/)
    assert.match(source, /if \(!online \|\| !hasContent/)
    assert.match(source, /\/mail\/drafts/)
    assert.doesNotMatch(source, /indexedDB|localStorage|outbox/i)
    assert.match(source, /MAX_ATTACHMENT_BYTES = 20 \* 1024 \* 1024/)
  })
}
