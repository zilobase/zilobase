import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { Bold, Italic, LinkIcon, ListIcon } from "@/shared/components/icons";
import { Button } from "@/shared/ui/button";

export function MailRichEditor({
  disabled,
  initialHtml,
  onChange,
}: {
  disabled: boolean;
  initialHtml: string;
  onChange: (value: { html: string; text: string }) => void;
}) {
  const editor = useEditor({
    content: initialHtml,
    editable: !disabled,
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    immediatelyRender: false,
    onUpdate: ({ editor: current }) =>
      onChange({ html: current.getHTML(), text: current.getText({ blockSeparator: "\n" }) }),
  });

  if (!editor) return <div className="min-h-64" />;
  if (editor.isEditable === disabled) editor.setEditable(!disabled);

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Link URL", previous ?? "https://")?.trim();
    if (href === undefined) return;
    if (!href) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  return (
    <div className="flex min-h-64 flex-1 flex-col rounded-md border border-control-border bg-control-background">
      <div className="flex items-center gap-1 border-b border-stroke-default p-1">
        <Button
          aria-label="Bold"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
          size="icon-sm"
          type="button"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
        >
          <Bold />
        </Button>
        <Button
          aria-label="Italic"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          size="icon-sm"
          type="button"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
        >
          <Italic />
        </Button>
        <Button
          aria-label="Bulleted list"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          size="icon-sm"
          type="button"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
        >
          <ListIcon />
        </Button>
        <Button
          aria-label="Link"
          disabled={disabled}
          onClick={setLink}
          size="icon-sm"
          type="button"
          variant={editor.isActive("link") ? "secondary" : "ghost"}
        >
          <LinkIcon />
        </Button>
      </div>
      <EditorContent
        aria-label="Message body"
        className="min-h-56 flex-1 px-3 py-2 [&_.tiptap]:min-h-52 [&_.tiptap]:outline-none [&_a]:text-content-link [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        editor={editor}
      />
    </div>
  );
}

export function mailTextToHtml(value: string) {
  if (!value) return "<p></p>";
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
