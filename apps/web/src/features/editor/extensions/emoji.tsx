import { Extension } from "@tiptap/core"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    emoji: {
      insertEmoji: (emoji: string) => ReturnType
    }
  }
}

export const EmojiExtension = Extension.create({
  name: "emoji",

  addCommands() {
    return {
      insertEmoji:
        (emoji) =>
        ({ commands }) =>
          commands.insertContent(emoji),
    }
  },
})
