export function register({ assert, loadModule, test }) {
  test("every database in a page hierarchy is restored into the page body", async () => {
    const { getMissingPlacedDatabaseIds } = await loadModule(
      "/src/pages/page-hierarchy-blocks.ts",
    )
    const firstId = "11111111-1111-4111-8111-111111111111"
    const secondId = "22222222-2222-4222-8222-222222222222"
    const content = {
      type: "doc",
      content: [
        { type: "databaseBlock", attrs: { databaseId: secondId } },
        { type: "paragraph" },
      ],
    }
    const placements = [
      placement(firstId, 0),
      placement(secondId, 1),
      placement(firstId, 2),
      { ...placement("other", 0), parentId: "another-page" },
    ]

    assert.deepEqual(
      getMissingPlacedDatabaseIds(content, placements, "page-1"),
      [firstId],
    )
  })

  test("active legacy meetings missing from their host page are restored once", async () => {
    const {
      extractMeetingBlockIds,
      getMissingHostedMeetingIds,
      insertMeetingBlockInContent,
    } = await loadModule("/src/pages/page-hierarchy-blocks.ts")
    const content = {
      type: "doc",
      content: [
        { type: "meetingBlock", attrs: { meetingId: "meeting-2" } },
        { type: "paragraph" },
      ],
    }
    const meetings = [
      meeting("meeting-2", "page-1", "2026-08-02T00:00:00.000Z"),
      meeting("meeting-1", "page-1", "2026-08-01T00:00:00.000Z"),
      meeting("other-page", "page-2", "2026-08-01T00:00:00.000Z"),
      {
        ...meeting("trashed", "page-1", "2026-07-31T00:00:00.000Z"),
        deletedAt: "2026-08-03T00:00:00.000Z",
      },
    ]

    assert.deepEqual(
      getMissingHostedMeetingIds(content, meetings, "page-1"),
      ["meeting-1"],
    )

    const restored = insertMeetingBlockInContent(content, "meeting-1")
    const duplicate = insertMeetingBlockInContent(
      restored.content,
      "meeting-1",
    )

    assert.equal(restored.alreadyEmbedded, false)
    assert.equal(duplicate.alreadyEmbedded, true)
    assert.deepEqual(extractMeetingBlockIds(duplicate.content), [
      "meeting-2",
      "meeting-1",
    ])
  })
}

function placement(itemId, position) {
  return {
    itemId,
    itemKind: "database",
    parentId: "page-1",
    parentKind: "page",
    placementKind: "primary",
    position,
  }
}

function meeting(id, pageId, createdAt) {
  return {
    createdAt,
    deletedAt: null,
    id,
    pageId,
  }
}
