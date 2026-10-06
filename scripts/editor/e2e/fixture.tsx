import "@/shared/styles/global.css";
import "@/app/styles.css";
import { ZilobaseFeaturesProvider, type ZilobaseAuthClient } from "@zilobase/features";
import { installSharedClient } from "@zilobase/features/data";
import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Editor as TiptapEditor, Node, Mark } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import { prosemirrorJSONToYDoc } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { Plugin } from "@tiptap/pm/state";
import { Editor } from "@/features/editor";
import {
  PageEditorRegistryProvider,
  useEditorWorkspace,
} from "@/features/editor/runtime/page-editor-registry";
import { ShortcutProvider } from "@/shared/shortcuts";
import { createEditorWorkspace } from "@/features/editor/runtime/editor-workspace";
import { EditorIntegration } from "@/features/editor/runtime/editor-integration";
import { transferBlocks } from "@/features/editor/operations/block-operations";
import { createPositionAnchor } from "@/features/editor/operations/position-anchor";
import { StructuralCommands } from "@/features/editor/operations/structural-commands";
import { ColumnsExtension } from "@/features/editor/extensions/columns";
import { insertCreatedBlock } from "@/features/editor/commands/structural-insertion";
import {
  PendingPageEmbeds,
  insertPendingPageEmbed,
} from "@/features/editor/drag-drop/pending-page-embed";
import { getDraggedEditorBlockPayload } from "@/features/editor/drag-drop/block-drag-session";
import { changedPageReferences } from "@/features/editor/operations/changed-page-references";
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
installSharedClient(queryClient, () => ({
  deployment: "editor-test",
  viewer: { kind: "public", capabilityId: "editor-test" },
}));
const features = {
  queryClient,
  auth: { getSession: async () => ({ user: null, session: null }) } as ZilobaseAuthClient,
  apiFetch: async () => ({}),
};
const ready: Record<string, TiptapEditor> = {};
let mountedWorkspace: ReturnType<typeof createEditorWorkspace>;
let shellRenders = 0;
function Panes() {
  shellRenders++;
  const workspace = useEditorWorkspace();
  mountedWorkspace = workspace;
  const [promoted, setPromoted] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [mainDocument, setMainDocument] = useState<Y.Doc | null>(null);
  const onMainReady = useCallback((editor: TiptapEditor | null) => {
    if (editor) ready.main = editor;
  }, []);
  const onDialogReady = useCallback((editor: TiptapEditor | null) => {
    if (editor) ready.dialog = editor;
    else delete ready.dialog;
  }, []);
  const onSideReady = useCallback((editor: TiptapEditor | null) => {
    if (editor) ready.side = editor;
  }, []);
  useEffect(() => {
    Object.assign(window, { promote: () => setPromoted(true), shellRenders: () => shellRenders });
  }, []);
  return (
    <>
      <button onClick={() => setPromoted(true)}>Promote side pane</button>
      <button onClick={() => setDialog((open) => !open)}>Toggle dialog</button>
      <button
        onClick={() => {
          const next = new Y.Doc();
          const paragraph = new Y.XmlElement("paragraph");
          const text = new Y.XmlText();
          text.insert(0, "Collaborative replacement");
          paragraph.insert(0, [text]);
          next.getXmlFragment("default").insert(0, [paragraph]);
          setMainDocument(next);
        }}
      >
        Replace main document
      </button>
      {dialog ? (
        <section
          role="dialog"
          data-testid="dialog-pane"
          data-slot="dialog-content"
          style={{
            position: "fixed",
            left: 500,
            top: 410,
            width: 600,
            height: 400,
            overflow: "auto",
            background: "white",
            zIndex: 100,
          }}
        >
          <Editor
            session={{ kind: "local", documentId: "dialog", content: "<p>Dialog target</p>" }}
            capabilities={{ comments: false }}
            presentation={{ hideMetadata: true, enableComments: false }}
            view={{ viewId: "dialog", paneId: "dialog-pane", onEditorReady: onDialogReady }}
          />
        </section>
      ) : null}
      <div style={{ display: "flex", height: 650, gap: 25 }}>
        <section
          data-testid="main-pane"
          style={{
            display: promoted ? "none" : "block",
            position: "relative",
            width: "55%",
            overflow: "auto",
            padding: 70,
            border: "1px solid #bbb",
          }}
        >
          <Editor
            session={{
              kind: "local",
              documentId: "main",
              content: "<p>Main one</p><p>Main two</p>",
              collaboration: mainDocument ? { document: mainDocument } : undefined,
            }}
            presentation={{ hideMetadata: true, enableComments: false }}
            capabilities={{ comments: false }}
            view={{ viewId: "main", paneId: "main-pane", onEditorReady: onMainReady }}
          />
        </section>
        <section
          data-testid="side-pane"
          style={{
            width: promoted ? "100%" : "40%",
            position: "relative",
            overflow: "auto",
            padding: 70,
            border: "1px solid #bbb",
          }}
        >
          <Editor
            session={{
              kind: "local",
              documentId: "side",
              content: "<p>Side one</p><p>Side two</p>",
            }}
            presentation={{ hideMetadata: true, enableComments: false }}
            capabilities={{ comments: false }}
            view={{ viewId: "side", paneId: "side-pane", onEditorReady: onSideReady }}
          />
        </section>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ZilobaseFeaturesProvider value={features}>
        <ShortcutProvider>
          <PageEditorRegistryProvider>
            <Panes />
          </PageEditorRegistryProvider>
        </ShortcutProvider>
      </ZilobaseFeaturesProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
const comment = Mark.create({
  name: "comment",
  addAttributes: () => ({ commentId: { default: null } }),
  parseHTML: () => [{ tag: "span[data-comment-id]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes, 0],
});
const pageBlock = Node.create({
  name: "pageBlock",
  group: "block",
  atom: true,
  addAttributes: () => ({ pageId: { default: null } }),
  renderHTML: () => ["div", { "data-type": "pageBlock" }],
});
const doc = (...texts: string[]) => ({
  type: "doc",
  content: texts.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
});
function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}
function scenario(collaborative = false) {
  const workspace = createEditorWorkspace();
  const releases: Array<() => void> = [];
  const documents: Y.Doc[] = [];
  const editors: TiptapEditor[] = [];
  function create(id: string, content = doc("A", "B"), plugins: Plugin[] = []) {
    const extensions = [
      StarterKit.configure({ undoRedo: collaborative ? false : {} }),
      comment,
      pageBlock,
      StructuralCommands,
      ColumnsExtension,
      PendingPageEmbeds,
    ];
    const seed = new TiptapEditor({ element: null, extensions, content });
    let document: Y.Doc | undefined;
    if (collaborative) {
      document = prosemirrorJSONToYDoc(seed.schema, content, "default");
      documents.push(document);
    }
    seed.destroy();
    const element = documentCreate();
    const editor = new TiptapEditor({
      element,
      extensions: [
        ...extensions,
        ...(document ? [Collaboration.configure({ document })] : []),
        EditorIntegration.configure({ workspace }),
      ],
      content: document ? undefined : content,
    });
    for (const plugin of plugins) editor.registerPlugin(plugin);
    releases.push(workspace.registerView(id, editor, id));
    editors.push(editor);
    return editor;
  }
  return {
    workspace,
    create,
    documents,
    dispose() {
      workspace.drag.reset();
      for (const release of releases) release();
      for (const editor of editors) editor.destroy();
      for (const document of documents) document.destroy();
    },
  };
}
function documentCreate() {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return element;
}
Object.assign(window, {
  editorReady: () =>
    Boolean(
      ready.main?.isInitialized && ready.side?.isInitialized && mountedWorkspace?.views.size >= 2,
    ),
  inspect: () => ({
    main: ready.main.getJSON(),
    side: ready.side.getJSON(),
    views: mountedWorkspace.views.size,
    mainId: ready.main.view.dom.dataset.id,
  }),
  mountedTransfer: () => {
    mountedWorkspace.drag.arm("main", { pos: 0, node: ready.main.state.doc.firstChild! });
    return transferBlocks(
      mountedWorkspace,
      mountedWorkspace.drag.active!.payload,
      ready.side,
      0,
      "move",
    );
  },
  mountedUndo: () => mountedWorkspace.history.undo(),
  readyEditors: ready,
  async runScenarios() {
    for (const collaborative of [false, true]) {
      const s = scenario(collaborative);
      try {
        const a = s.create("a"),
          b = s.create("b", doc("Target"));
        s.workspace.drag.arm("a", { pos: 0, node: a.state.doc.firstChild! });
        const dataTransfer = new DataTransfer();
        s.workspace.drag.finalize(new DragEvent("dragstart", { dataTransfer }), "a");
        assert(
          getDraggedEditorBlockPayload(dataTransfer)?.operationId,
          "finalized MIME payload missing",
        );
        assert(Boolean(dataTransfer.getData("text/html")), "external HTML missing");
        // Unrelated content before a source moves its anchor; the original block still transfers.
        a.commands.insertContentAt(0, {
          type: "paragraph",
          content: [{ type: "text", text: "Before" }],
        });
        assert(
          transferBlocks(s.workspace, s.workspace.drag.active!.payload, b, 0, "move").ok,
          "source anchor failed to follow unrelated insertion",
        );
        assert(s.workspace.history.undo(), "anchor transfer undo missing");
        s.workspace.drag.reset();
        const pos = a.state.doc.firstChild!.nodeSize;
        s.workspace.drag.arm("a", { pos, node: a.state.doc.nodeAt(pos)! });
        const moved = transferBlocks(s.workspace, s.workspace.drag.active!.payload, b, 0, "move");
        assert(moved.ok, "cross-document move rejected");
        s.workspace.drag.reset();
        assert(b.state.doc.firstChild!.textContent === "A", "destination content missing");
        b.commands.insertContentAt(1, "typed");
        assert(s.workspace.history.undo(), "typing undo missing");
        assert(b.state.doc.firstChild!.textContent === "A", "first undo must undo typing only");
        assert(s.workspace.history.undo(), "paired undo missing");
        assert(
          a.state.doc.textContent === "BeforeAB" && b.state.doc.textContent === "Target",
          "paired undo failed",
        );
        assert(s.workspace.history.redo(), "paired redo missing");
        assert(
          a.state.doc.textContent === "BeforeB" && b.state.doc.textContent === "ATarget",
          "paired redo failed",
        );
        // Copying preserves source and strips only comment marks in the destination.
        a.commands.setContent({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Commented",
                  marks: [{ type: "comment", attrs: { commentId: "thread" } }],
                },
              ],
            },
          ],
        });
        s.workspace.drag.arm("a", { pos: 0, node: a.state.doc.firstChild! });
        assert(
          transferBlocks(s.workspace, s.workspace.drag.active!.payload, b, 0, "copy").ok,
          "copy rejected",
        );
        assert(
          a.state.doc.firstChild!.firstChild!.marks.length === 1 &&
            b.state.doc.firstChild!.firstChild!.marks.length === 0,
          "comment transfer policy failed",
        );
        s.workspace.drag.reset();
        a.commands.setContent(doc("A", "B", "C"));
        a.commands.setTextSelection({ from: 1, to: 5 });
        s.workspace.drag.arm("a", { pos: 0, node: a.state.doc.firstChild! });
        assert(
          s.workspace.drag.active!.payload.blockCount === 2,
          "multiple selection was not captured",
        );
        assert(
          transferBlocks(
            s.workspace,
            s.workspace.drag.active!.payload,
            a,
            a.state.doc.content.size,
            "move",
          ).ok,
          "same-document move failed",
        );
        assert(a.state.doc.textContent === "CAB", "same-document mapping lost blocks");
        assert(
          s.workspace.history.undo() && a.state.doc.textContent === "ABC",
          "same-document undo failed",
        );
        s.workspace.drag.reset();
        s.workspace.drag.arm("a", { pos: 0, node: a.state.doc.firstChild! });
        a.commands.insertContentAt(1, "changed");
        assert(
          !transferBlocks(s.workspace, s.workspace.drag.active!.payload, b, 0, "move").ok,
          "changed source must cancel",
        );
        s.workspace.drag.reset();
        a.commands.setContent(doc("Commented"));
        const before = JSON.stringify(a.getJSON());
        assert(a.can().setColumns(2, true), "column dry-run should succeed");
        assert(JSON.stringify(a.getJSON()) === before, "column dry-run mutated document");
        a.commands.setColumns(2, true);
        assert(a.state.doc.firstChild!.type.name === "columnBlock", "column insertion failed");
        a.commands.setNodeSelection(0);
        assert(a.can().unsetColumns(), "column unset dry-run should succeed");
        a.commands.unsetColumns();
        assert(a.state.doc.textContent === "Commented", "column conversion lost content");
        const anchor = createPositionAnchor(b, b.state.doc.content.size);
        b.commands.insertContentAt(1, "prefix");
        assert(anchor.resolve() === b.state.doc.content.size, "pending anchor did not map");
        anchor.dispose();
        a.commands.setContent({
          type: "doc",
          content: [{ type: "pageBlock", attrs: { pageId: "embedded" } }, { type: "paragraph" }],
        });
        const tr = a.state.tr.delete(0, 1);
        assert(
          changedPageReferences(tr).removed.has("embedded"),
          "removed structural reference missing",
        );
        let resolve!: (value: string) => void;
        const pending = insertCreatedBlock({
          editor: b,
          range: { from: 0, to: 0 },
          create: () =>
            new Promise<string>((r) => {
              resolve = r;
            }),
          content: () => ({ type: "paragraph", content: [{ type: "text", text: "Created" }] }),
        });
        b.commands.insertContentAt(b.state.doc.content.size, {
          type: "paragraph",
          content: [{ type: "text", text: "Later" }],
        });
        resolve("resource");
        await pending;
        assert(b.state.doc.firstChild!.textContent === "Created", "delayed insert anchor failed");
        let resourceLinks = 0;
        const resourceErrors: unknown[] = [];
        insertPendingPageEmbed(
          b.view,
          b.state.doc.content.size,
          "linked",
          "Linked page",
          async () => {
            resourceLinks++;
            return {
              undo: async () => {
                resourceLinks--;
              },
              redo: async () => {
                resourceLinks++;
              },
            };
          },
          (error) => resourceErrors.push(error),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        const linkedCount = () => {
          let count = 0;
          b.state.doc.descendants((node) => {
            if (node.type.name === "pageBlock" && node.attrs.pageId === "linked") count++;
          });
          return count;
        };
        assert(
          resourceLinks === 1 && linkedCount() === 1,
          "appended trailing paragraph incorrectly compensated a confirmed link",
        );
        assert(s.workspace.history.undo(), "resource link undo missing");
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert(
          resourceLinks === 0 && linkedCount() === 0,
          "link undo did not pair document and resource",
        );
        assert(s.workspace.history.redo(), "resource link redo missing");
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert(
          resourceLinks === 1 && linkedCount() === 1 && resourceErrors.length === 0,
          "link redo did not pair document and resource",
        );
      } finally {
        s.dispose();
      }
    }
    const s = scenario();
    try {
      const a = s.create("a"),
        b = s.create("b", doc("Target"));
      a.registerPlugin(new Plugin({ filterTransaction: (tr) => !tr.docChanged }));
      s.workspace.drag.arm("a", { pos: 0, node: a.state.doc.firstChild! });
      const result = transferBlocks(s.workspace, s.workspace.drag.active!.payload, b, 0, "move");
      assert(
        !result.ok && a.state.doc.textContent === "AB" && b.state.doc.textContent === "Target",
        "failed source deletion was not compensated",
      );
    } finally {
      s.dispose();
    }
    const remoteScenario = scenario(true);
    try {
      const a = remoteScenario.create("remote-a"),
        b = remoteScenario.create("remote-b", doc("Destination"));
      remoteScenario.workspace.drag.arm("remote-a", { pos: 0, node: a.state.doc.firstChild! });
      const replica = new Y.Doc();
      Y.applyUpdate(replica, Y.encodeStateAsUpdate(remoteScenario.documents[0]));
      const remote = new TiptapEditor({
        element: documentCreate(),
        extensions: [
          StarterKit.configure({ undoRedo: false }),
          comment,
          pageBlock,
          StructuralCommands,
          ColumnsExtension,
          Collaboration.configure({ document: replica }),
        ],
      });
      try {
        remote.commands.insertContentAt(0, {
          type: "paragraph",
          content: [{ type: "text", text: "Remote" }],
        });
        Y.applyUpdate(remoteScenario.documents[0], Y.encodeStateAsUpdate(replica));
        assert(
          transferBlocks(
            remoteScenario.workspace,
            remoteScenario.workspace.drag.active!.payload,
            b,
            0,
            "move",
          ).ok,
          `remote edit before source did not map: ${JSON.stringify({ from: remoteScenario.workspace.drag.active?.from.resolve(), to: remoteScenario.workspace.drag.active?.to.resolve(), text: a.state.doc.textContent, source: remoteScenario.workspace.drag.source(remoteScenario.workspace.drag.active!.payload)?.slice.toJSON() })}`,
        );
        assert(
          a.state.doc.textContent === "RemoteB" && b.state.doc.textContent === "ADestination",
          "remote transfer content incorrect",
        );
        remoteScenario.workspace.drag.reset();
      } finally {
        remote.destroy();
        replica.destroy();
      }
    } finally {
      remoteScenario.dispose();
    }
    return "passed";
  },
});
