import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const testDir = dirname(fileURLToPath(import.meta.url))
const mentionHelpersPath = join(
  testDir,
  "../src/components/workspace-comment-mentions.ts",
)

export function register({ assert, loadModule, test }) {
  test("comment mention trigger detects @ tokens at the cursor", async () => {
    const { getCommentMentionTrigger } = await loadModule(mentionHelpersPath)

    assert.deepEqual(getCommentMentionTrigger("@al", 3), {
      end: 3,
      query: "al",
      start: 0,
    })
    assert.deepEqual(getCommentMentionTrigger("hello @al", 9), {
      end: 9,
      query: "al",
      start: 6,
    })
    assert.equal(getCommentMentionTrigger("email a@b", 9), null)
    assert.equal(getCommentMentionTrigger("hello @al there", 15), null)
  })

  test("comment mention insertion replaces the active token", async () => {
    const { getCommentMentionTrigger, insertCommentMention } =
      await loadModule(mentionHelpersPath)
    const value = "Please ask @al tomorrow"
    const trigger = getCommentMentionTrigger(value, 14)

    assert.deepEqual(insertCommentMention(value, trigger, "Alex Chen"), {
      cursor: 22,
      value: "Please ask @Alex Chen tomorrow",
    })
  })

  test("comment mention filtering excludes the current user and matches name or email", async () => {
    const { filterCommentMentionMembers } = await loadModule(mentionHelpersPath)
    const members = [
      { email: "alex@example.com", id: "user-1", name: "Alex Chen" },
      { email: "bea@example.com", id: "user-2", name: "Bea Patel" },
      { email: "casey@example.com", id: "user-3", name: "Casey" },
    ]

    assert.deepEqual(
      filterCommentMentionMembers(members, "user-1", ""),
      members.slice(1),
    )
    assert.deepEqual(
      filterCommentMentionMembers(members, "user-1", "bea"),
      [members[1]],
    )
    assert.deepEqual(
      filterCommentMentionMembers(members, "user-1", "casey@example"),
      [members[2]],
    )
  })

  test("comment mention labels include names and emails longest first", async () => {
    const { getCommentMentionLabels } = await loadModule(mentionHelpersPath)

    assert.deepEqual(
      getCommentMentionLabels([
        { email: "alex@example.com", id: "user-1", name: "Alex Chen" },
        { email: "alex@example.com", id: "user-2", name: "Alex" },
      ]),
      ["alex@example.com", "Alex Chen", "Alex"],
    )
  })

  test("comment mention tokenization marks exact known mentions", async () => {
    const { tokenizeCommentMentions } = await loadModule(mentionHelpersPath)

    assert.deepEqual(
      tokenizeCommentMentions(
        "Please ask @Alex Chen and @bea@example.com.",
        ["alex@example.com", "Alex Chen", "bea@example.com"],
      ),
      [
        { isMention: false, text: "Please ask " },
        { isMention: true, text: "@Alex Chen" },
        { isMention: false, text: " and " },
        { isMention: true, text: "@bea@example.com" },
        { isMention: false, text: "." },
      ],
    )

    assert.deepEqual(
      tokenizeCommentMentions("@Alex Chenault", ["Alex Chen"]),
      [{ isMention: false, text: "@Alex Chenault" }],
    )
  })
}
