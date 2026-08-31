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

export function createDatabaseBlockNodes(
  databaseId: string,
  showTitle = true,
): ProseMirrorNode[] {
  return [
    {
      type: "databaseBlock",
      attrs: { databaseId, showTitle },
    },
    { type: "paragraph" },
  ]
}

function normalizeHeadingText(text: string) {
  return text.trim().replace(/^#+\s*/, "").trim().toLowerCase()
}

function normalizeItemTitle(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
}

export function shouldShowInlineDatabaseTitle(
  pageTitle: string | null | undefined,
  databaseTitle: string | null | undefined,
) {
  return normalizeItemTitle(pageTitle) !== normalizeItemTitle(databaseTitle)
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

function updateDatabaseBlockTitle(
  node: ProseMirrorNode,
  databaseId: string,
  showTitle: boolean,
): { node: ProseMirrorNode; titleUpdated: boolean } {
  let nextNode = node
  let titleUpdated = false

  if (
    node.type === "databaseBlock" &&
    node.attrs?.databaseId === databaseId &&
    node.attrs.showTitle !== showTitle
  ) {
    nextNode = {
      ...node,
      attrs: { ...node.attrs, showTitle },
    }
    titleUpdated = true
  }

  if (nextNode.content) {
    const nextContent = nextNode.content.map((child) => {
      const result = updateDatabaseBlockTitle(child, databaseId, showTitle)
      titleUpdated ||= result.titleUpdated
      return result.node
    })
    if (titleUpdated) nextNode = { ...nextNode, content: nextContent }
  }

  return { node: nextNode, titleUpdated }
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
    showTitle?: boolean
  },
): {
  content: ProseMirrorDoc
  alreadyEmbedded: boolean
  titleUpdated: boolean
} {
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
    if (options.showTitle === undefined) {
      return { content: doc, alreadyEmbedded: true, titleUpdated: false }
    }
    let titleUpdated = false
    const content = nodes.map((node) => {
      const result = updateDatabaseBlockTitle(
        node,
        options.databaseId,
        options.showTitle!,
      )
      titleUpdated ||= result.titleUpdated
      return result.node
    })
    return {
      content: titleUpdated ? { ...doc, content } : doc,
      alreadyEmbedded: true,
      titleUpdated,
    }
  }

  const blockNodes = createDatabaseBlockNodes(
    options.databaseId,
    options.showTitle !== false,
  )
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
      titleUpdated: false,
    }
  }

  return {
    content: {
      ...doc,
      content: [...nodes, ...blockNodes],
    },
    alreadyEmbedded: false,
    titleUpdated: false,
  }
}
