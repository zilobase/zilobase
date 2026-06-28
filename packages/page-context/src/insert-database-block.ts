type ProseMirrorNode = {
  attrs?: Record<string, unknown>
  content?: ProseMirrorNode[]
  marks?: Array<{ attrs?: Record<string, unknown>; type: string }>
  text?: string
  type?: string
}

type ProseMirrorDoc = {
  content?: ProseMirrorNode[]
  type?: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createDatabaseBlockNodes(databaseId: string): ProseMirrorNode[] {
  return [
    {
      type: "databaseBlock",
      attrs: { databaseId, showTitle: true },
    },
    { type: "paragraph" },
  ]
}

function normalizeHeadingText(text: string) {
  return text.trim().replace(/^#+\s*/, "").trim().toLowerCase()
}

function nodeContainsDatabaseBlock(
  node: ProseMirrorNode,
  databaseId: string,
): boolean {
  if (
    node.type === "databaseBlock" &&
    typeof node.attrs?.databaseId === "string" &&
    node.attrs.databaseId === databaseId
  ) {
    return true
  }

  return (node.content ?? []).some((child) =>
    nodeContainsDatabaseBlock(child, databaseId),
  )
}

function findHeadingIndex(nodes: ProseMirrorNode[], heading: string) {
  const target = normalizeHeadingText(heading)

  return nodes.findIndex((node) => {
    if (!node.type?.startsWith("heading")) {
      return false
    }

    const text = (node.content ?? [])
      .map((child) => child.text ?? "")
      .join("")
      .trim()

    return normalizeHeadingText(text) === target
  })
}

function insertNodesAt(
  nodes: ProseMirrorNode[],
  index: number,
  inserted: ProseMirrorNode[],
) {
  return [...nodes.slice(0, index), ...inserted, ...nodes.slice(index)]
}

export function insertDatabaseBlockInContent(
  content: unknown,
  options: {
    afterHeading?: string
    databaseId: string
  },
): { content: ProseMirrorDoc; alreadyEmbedded: boolean } {
  if (!UUID_PATTERN.test(options.databaseId)) {
    throw new Error("databaseId must be a valid UUID.")
  }

  const doc: ProseMirrorDoc =
    content &&
    typeof content === "object" &&
    !Array.isArray(content) &&
    (content as ProseMirrorDoc).type === "doc"
      ? (content as ProseMirrorDoc)
      : { type: "doc", content: [] }

  const nodes = [...(doc.content ?? [])]

  if (nodes.some((node) => nodeContainsDatabaseBlock(node, options.databaseId))) {
    return { content: doc, alreadyEmbedded: true }
  }

  const blockNodes = createDatabaseBlockNodes(options.databaseId)
  const heading = options.afterHeading?.trim()

  if (heading) {
    const headingIndex = findHeadingIndex(nodes, heading)

    if (headingIndex === -1) {
      throw new Error(
        `Could not find section heading "${heading}" in page content.`,
      )
    }

    let insertIndex = headingIndex + 1

    while (
      insertIndex < nodes.length &&
      !nodes[insertIndex]?.type?.startsWith("heading")
    ) {
      insertIndex += 1
    }

    return {
      content: {
        ...doc,
        content: insertNodesAt(nodes, insertIndex, blockNodes),
      },
      alreadyEmbedded: false,
    }
  }

  return {
    content: {
      ...doc,
      content: [...nodes, ...blockNodes],
    },
    alreadyEmbedded: false,
  }
}