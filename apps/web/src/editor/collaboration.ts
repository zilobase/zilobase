import {
  createNodeFromContent,
  getSchema,
  type Extensions,
} from "@tiptap/core"
import { prosemirrorToYDoc } from "@tiptap/y-tiptap"
import * as Y from "yjs"
import { emptyContent } from "./constants"

export const normalizeEditorContent = (content: unknown) => {
  if (typeof content === "string") return content.trim() ? content : emptyContent
  if (content && typeof content === "object") return content
  return emptyContent
}

export const createCollaborationSeedUpdate = (
  content: unknown,
  extensions: Extensions,
) => {
  try {
    const schema = getSchema(extensions)
    const nodeOrFragment = createNodeFromContent(
      normalizeEditorContent(content),
      schema,
      { errorOnInvalidContent: false },
    )
    const doc =
      "type" in nodeOrFragment
        ? nodeOrFragment
        : schema.topNodeType.create(null, nodeOrFragment)
    const ydoc = prosemirrorToYDoc(doc, "default")
    const update = Y.encodeStateAsUpdate(ydoc)
    ydoc.destroy()
    return update
  } catch (error) {
    console.error("Failed to seed collaboration document", error)
    return null
  }
}

const getCollaborationUserColor = (user: Record<string, unknown>) =>
  typeof user.color === "string" ? user.color : "#2563eb"

const getCollaborationUserName = (user: Record<string, unknown>) =>
  typeof user.name === "string" ? user.name : "Collaborator"

const toTransparentColor = (color: string, alpha: number) => {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export const renderCollaborationCaret = (user: Record<string, unknown>) => {
  const color = getCollaborationUserColor(user)
  const name = getCollaborationUserName(user)
  const cursor = document.createElement("span")
  const label = document.createElement("span")

  Object.assign(cursor.style, {
    borderLeft: `2px solid ${color}`,
    marginLeft: "-1px",
    marginRight: "-1px",
    pointerEvents: "none",
    position: "relative",
  })
  label.textContent = name
  Object.assign(label.style, {
    background: color,
    borderRadius: "4px",
    color: "#fff",
    fontSize: "11px",
    fontWeight: "500",
    left: "-1px",
    lineHeight: "1",
    padding: "3px 5px",
    position: "absolute",
    top: "-1.35rem",
    whiteSpace: "nowrap",
  })
  cursor.append(label)
  return cursor
}

export const renderCollaborationSelection = (user: Record<string, unknown>) => ({
  nodeName: "span",
  style: `background-color: ${toTransparentColor(
    getCollaborationUserColor(user),
    0.22
  )}`,
})