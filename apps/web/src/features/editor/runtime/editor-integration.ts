import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorWorkspace } from "./editor-workspace";
const integrationKey = new PluginKey<EditorWorkspace>("editorIntegration");
export const EditorIntegration = Extension.create<{ workspace: EditorWorkspace }>({
  name: "editorIntegration",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: integrationKey,
        state: { init: () => this.options.workspace, apply: (_tr, previous) => previous },
      }),
    ];
  },
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => this.options.workspace.history.undo(),
      "Mod-y": () => this.options.workspace.history.redo(),
      "Shift-Mod-z": () => this.options.workspace.history.redo(),
    };
  },
  priority: 1100,
});
export function workspaceForView(view: import("@tiptap/pm/view").EditorView) {
  return integrationKey.getState(view.state);
}
