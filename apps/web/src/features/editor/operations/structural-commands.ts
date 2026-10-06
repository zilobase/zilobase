import { Extension, type Content } from "@tiptap/core";
/** Structural entrypoints share Tiptap's transaction and remain safe under .can(). */
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    structuralOperations: {
      insertBlocksAt: (pos: number, content: Content) => ReturnType;
      replaceBlocksRange: (range: { from: number; to: number }, content: Content) => ReturnType;
      removeBlocksRange: (range: { from: number; to: number }) => ReturnType;
    };
  }
}
export const StructuralCommands = Extension.create({
  name: "structuralOperations",
  addCommands() {
    return {
      insertBlocksAt:
        (pos, content) =>
        ({ editor, commands }) =>
          editor.isEditable && commands.insertContentAt(pos, content),
      replaceBlocksRange:
        (range, content) =>
        ({ editor, commands }) =>
          editor.isEditable && commands.insertContentAt(range, content),
      removeBlocksRange:
        (range) =>
        ({ editor, commands }) =>
          editor.isEditable && commands.deleteRange(range),
    };
  },
});
