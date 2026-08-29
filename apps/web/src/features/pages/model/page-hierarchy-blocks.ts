import { extractDatabaseIds } from "@zilobase/page-context"

type DatabasePlacement = {
  itemId: string
  itemKind: string
  parentId: string
  parentKind: string
  position: number
}

type MeetingReference = {
  createdAt?: string | null
  deletedAt?: string | null
  id: string
  pageId: string
}

type ProseMirrorNode = {
  attrs?: Record<string, unknown>
  content?: ProseMirrorNode[]
  type?: string
}

type ProseMirrorDocument = ProseMirrorNode & {
  type: "doc"
}

export function getPlacedDatabaseIds(
  placements: readonly DatabasePlacement[],
  pageId: string,
) {
  const ordered = placements
    .filter(
      (placement) =>
        placement.parentKind === "page" &&
        placement.parentId === pageId &&
        placement.itemKind === "database",
    )
    .sort((first, second) => first.position - second.position)

  return [...new Set(ordered.map((placement) => placement.itemId))]
}

export function getMissingPlacedDatabaseIds(
  content: unknown,
  placements: readonly DatabasePlacement[],
  pageId: string,
) {
  const embeddedIds = new Set(extractDatabaseIds(content))

  return getPlacedDatabaseIds(placements, pageId).filter(
    (databaseId) => !embeddedIds.has(databaseId),
  )
}

export function extractMeetingBlockIds(content: unknown) {
  const meetingIds = new Set<string>()

  function walk(node: unknown) {
    if (!node || typeof node !== "object") {
      return
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child)
      }
      return
    }

    const record = node as ProseMirrorNode
    const meetingId = record.attrs?.meetingId

    if (
      record.type === "meetingBlock" &&
      typeof meetingId === "string" &&
      meetingId.length > 0
    ) {
      meetingIds.add(meetingId)
    }

    walk(record.content)
  }

  walk(parseContent(content))
  return [...meetingIds]
}

export function getMissingHostedMeetingIds(
  content: unknown,
  meetings: readonly MeetingReference[] | null | undefined,
  pageId: string,
) {
  const embeddedIds = new Set(extractMeetingBlockIds(content))

  return (meetings ?? [])
    .filter((meeting) => meeting.pageId === pageId && !meeting.deletedAt)
    .sort((first, second) => {
      const createdAtDifference =
        getTimestamp(first.createdAt) - getTimestamp(second.createdAt)

      return createdAtDifference || first.id.localeCompare(second.id)
    })
    .map((meeting) => meeting.id)
    .filter((meetingId, index, meetingIds) => {
      return (
        !embeddedIds.has(meetingId) && meetingIds.indexOf(meetingId) === index
      )
    })
}

export function insertMeetingBlockInContent(
  content: unknown,
  meetingId: string,
): { alreadyEmbedded: boolean; content: ProseMirrorDocument } {
  const doc = getDocument(content)

  if (extractMeetingBlockIds(doc).includes(meetingId)) {
    return { alreadyEmbedded: true, content: doc }
  }

  return {
    alreadyEmbedded: false,
    content: {
      ...doc,
      content: [
        ...(doc.content ?? []),
        { type: "meetingBlock", attrs: { meetingId } },
        { type: "paragraph" },
      ],
    },
  }
}

function parseContent(content: unknown) {
  if (typeof content !== "string") {
    return content
  }

  try {
    return JSON.parse(content) as unknown
  } catch {
    return null
  }
}

function getDocument(content: unknown): ProseMirrorDocument {
  const parsed = parseContent(content)

  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as ProseMirrorNode).type === "doc"
  ) {
    return parsed as ProseMirrorDocument
  }

  return { type: "doc", content: [] }
}

function getTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}
