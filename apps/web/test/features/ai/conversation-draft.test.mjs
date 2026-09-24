export function register({ assert, loadModule, test }) {
  test("conversation requests separate resource context, mentions and uploaded files", async () => {
    const { buildConversationRequest } = await loadModule(
      "/src/features/ai/conversations/model/conversation-draft.ts",
    );
    const input = {
      attachments: [
        { type: "person", id: "person" },
        { type: "database", id: "db" },
        { type: "page", id: "page" },
      ],
      primarySource: { type: "page", id: "primary", role: "primary" },
      modelId: "auto",
      debugStream: false,
      threadId: "thread",
      attachmentIds: ["upload"],
      clientTurnId: "turn",
    };
    const before = structuredClone(input);
    assert.deepEqual(buildConversationRequest(input), {
      attachmentIds: ["upload"],
      clientTurnId: "turn",
      contextRefs: [
        { id: "primary", role: "primary", type: "page" },
        { id: "db", role: "attached", type: "database" },
        { id: "page", role: "attached", type: "page" },
      ],
      modelId: "auto",
      debugStream: false,
      mentionedUserIds: ["person"],
      threadId: "thread",
    });
    assert.deepEqual(input, before);
    assert.deepEqual(
      buildConversationRequest({ ...input, attachments: [], primarySource: null, threadId: null })
        .contextRefs,
      [],
    );
  });
  test("removing a draft mention preserves suffix and the existing cursor convention", async () => {
    const { removeDraftMention } = await loadModule(
      "/src/features/ai/conversations/model/conversation-draft.ts",
    );
    assert.deepEqual(
      removeDraftMention("Find @john next", { mentionStart: 5, mentionQuery: "john" }),
      { text: "Find  next", cursor: 5 },
    );
    assert.deepEqual(removeDraftMention("  @a next", { mentionStart: 2, mentionQuery: "a" }), {
      text: "next",
      cursor: 2,
    });
    assert.deepEqual(removeDraftMention("@", { mentionStart: 0, mentionQuery: "" }), {
      text: "",
      cursor: 0,
    });
  });
  test("draft readiness allows thread creation only with an actor and workspace", async () => {
    const { conversationReadiness, canApplyConversationEdits } = await loadModule(
      "/src/features/ai/conversations/model/conversation-draft.ts",
    );
    assert.deepEqual(conversationReadiness("workspace", "user", null), {
      isComposerReady: true,
      isAgentReady: false,
      conversationId: "chat-not-ready",
    });
    assert.deepEqual(conversationReadiness("workspace", "user", "thread"), {
      isComposerReady: true,
      isAgentReady: true,
      conversationId: "thread",
    });
    assert.equal(conversationReadiness(null, "user", "thread").isAgentReady, false);
    assert.equal(conversationReadiness("workspace", null, "thread").isComposerReady, false);
    for (const access of ["view", "comment", undefined, null])
      assert.equal(canApplyConversationEdits(true, "page", access), false);
    for (const access of ["edit", "full"])
      assert.equal(canApplyConversationEdits(true, "page", access), true);
    assert.equal(canApplyConversationEdits(false, "page", "full"), false);
    assert.equal(canApplyConversationEdits(true, null, "edit"), false);
  });
}
