import { workspaceForView } from "../runtime/editor-integration";
import { dispatchVerified } from "../operations/dispatch-verified";
import type { EditorResourceReceipt } from "../core/types";
import { Extension } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

const pendingEmbeds = new PluginKey<DecorationSet>("pendingPageEmbeds");

type PendingEmbedAction = { add: { id: object; pos: number; title: string } } | { remove: object };

export function createPendingPageEmbedPlugin() {
  return new Plugin<DecorationSet>({
    key: pendingEmbeds,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, previous) {
        let next = previous.map(tr.mapping, tr.doc);
        const action = tr.getMeta(pendingEmbeds) as PendingEmbedAction | undefined;
        if (action && "add" in action) {
          const { id, pos, title } = action.add;
          next = next.add(tr.doc, [
            Decoration.widget(
              pos,
              () => {
                const card = document.createElement("div");
                card.className =
                  "page-block flex h-10 w-full items-center gap-2 rounded-md bg-surface-subtle px-3 text-sm text-content-primary";
                card.textContent = title || "Untitled";
                card.contentEditable = "false";
                card.setAttribute("role", "status");
                card.setAttribute("aria-label", `Adding ${title || "page"}`);
                card.setAttribute("aria-busy", "true");
                return card;
              },
              { id, side: -1 },
            ),
          ]);
        } else if (action && "remove" in action) {
          next = next.remove(next.find(undefined, undefined, (spec) => spec.id === action.remove));
        }
        return next;
      },
    },
    props: { decorations: (state) => pendingEmbeds.getState(state) },
  });
}

export const PendingPageEmbeds = Extension.create({
  name: "pendingPageEmbeds",
  addProseMirrorPlugins: () => [createPendingPageEmbedPlugin()],
});

/** Keep unconfirmed embeds local, and map their positions through ongoing edits. */
export function insertPendingPageEmbed(
  view: EditorView,
  pos: number,
  pageId: string,
  title: string,
  embed: () => void | EditorResourceReceipt | Promise<void | EditorResourceReceipt>,
  onError: (error: unknown) => void,
) {
  const id = {};
  view.dispatch(
    view.state.tr
      .setMeta(pendingEmbeds, { add: { id, pos, title } })
      .setMeta("addToHistory", false),
  );
  view.focus();

  const finish = async (resource: void | EditorResourceReceipt, error?: { cause: unknown }) => {
    if (view.isDestroyed) {
      await resource?.undo();
      return;
    }
    const pending = pendingEmbeds
      .getState(view.state)
      ?.find(undefined, undefined, (spec) => spec.id === id)[0];
    const tr = view.state.tr.setMeta(pendingEmbeds, { remove: id });
    if (!error && pending && view.editable) {
      const node = view.state.schema.nodes.pageBlock.create({ pageId });
      const $pos = tr.doc.resolve(pending.from);
      if ($pos.parent.canReplaceWith($pos.index(), $pos.index(), node.type)) {
        closeHistory(tr).insert(pending.from, node);
      }
    }
    if (!tr.docChanged) tr.setMeta("addToHistory", false);
    const workspace = workspaceForView(view);
    const editor = workspace?.getEditor(view);
    const operationId = crypto.randomUUID();
    let applied: boolean;
    if (editor && tr.docChanged)
      applied = workspace!.history.group(
        [editor],
        "Link page",
        () => dispatchVerified(editor, tr).applied,
        operationId,
      );
    else {
      view.dispatch(tr);
      applied = view.state.doc.eq(tr.doc);
    }
    if (resource) {
      if (!tr.docChanged || !applied) await resource.undo();
      else workspace?.history.attachResource(operationId, resource, onError);
    }
    if (error) onError(error.cause);
  };

  // Also catch synchronous callbacks; never leave a stranded preview.
  void Promise.resolve()
    .then(embed)
    .then(
      (resource) => finish(resource),
      (error) => finish(undefined, { cause: error }),
    )
    .catch(onError);
}
