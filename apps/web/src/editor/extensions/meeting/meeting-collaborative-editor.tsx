import { useEffect } from "react"
import Collaboration from "@tiptap/extension-collaboration"
import Placeholder from "@tiptap/extension-placeholder"
import StarterKit from "@tiptap/starter-kit"
import { EditorContent, useEditor } from "@tiptap/react"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type * as Y from "yjs"

export function MeetingCollaborativeEditor({
  document,
  editable,
  field,
  placeholder,
  provider: _provider,
}: {
  document: Y.Doc
  editable: boolean
  field: "notes" | "summary"
  placeholder: string
  provider: HocuspocusProvider | null
}) {
  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      Collaboration.configure({ document, field }),
      Placeholder.configure({ placeholder }),
    ],
  }, [document, field])

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editable, editor])

  return (
    <EditorContent
      className="meeting-collaborative-editor min-h-28 text-sm leading-6"
      editor={editor}
    />
  )
}
