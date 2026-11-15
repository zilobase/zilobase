import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

export function register({ assert, sourcePath, test }) {
  const runtime = () => loadWorkflows(sourcePath);

  test("page prefetch starts eagerly, deduplicates and retains its two-task limit until both reads settle", async () => {
    const { prefetchPageForNavigation: prefetch, controls } = await runtime();
    const query = deferred();
    controls.queryTask = query.promise;
    prefetch("one");
    prefetch("one");
    prefetch("two");
    prefetch("three");
    assert.deepEqual(controls.reads, ["one", "two"]);
    assert.deepEqual(controls.acquired, [
      ["user", "one"],
      ["user", "two"],
    ]);
    await settle();
    assert.equal(controls.released.length, 2);
    prefetch("three");
    assert.equal(controls.reads.length, 2, "document completion alone must not release the slot");
    query.resolve();
    await settle();
    prefetch("three");
    await settle();
    assert.deepEqual(controls.reads, ["one", "two", "three"]);
  });

  test("page prefetch skips offline/anonymous calls and scopes deduplication by account", async () => {
    const { prefetchPageForNavigation: prefetch, controls } = await runtime();
    controls.online = false;
    prefetch("same");
    controls.online = true;
    controls.userId = null;
    prefetch("same");
    assert.deepEqual(controls.acquired, []);
    const query = deferred();
    controls.queryTask = query.promise;
    controls.userId = "first";
    prefetch("same");
    controls.userId = "second";
    prefetch("same");
    assert.deepEqual(controls.acquired, [
      ["first", "same"],
      ["second", "same"],
    ]);
    query.resolve();
    await settle();
  });

  test("page prefetch releases acquired documents on failures and preserves existing initialization fallbacks", async () => {
    for (const stage of [
      "persisted",
      "ticket",
      "apply",
      "flush",
      "persistence",
      "initialize",
      "acquire",
      "success",
    ]) {
      const { prefetchPageForNavigation: prefetch, controls } = await runtime();
      const failure = new Error(stage);
      if (stage === "persisted") controls.entry.hasPersistedState = true;
      if (stage === "ticket") controls.ticket = () => Promise.reject(failure);
      if (stage === "apply")
        controls.apply = () => {
          throw failure;
        };
      if (stage === "flush") controls.entry.flush = () => Promise.reject(failure);
      if (stage === "persistence") controls.entry.persistenceError = failure;
      if (stage === "initialize") controls.initialize = () => Promise.reject(failure);
      if (stage === "acquire") controls.acquire = () => Promise.reject(failure);
      prefetch("page");
      await settle();
      assert.equal(controls.released.length, stage === "acquire" ? 0 : 1, stage);
      assert.equal(
        controls.initialized.length,
        ["success", "initialize"].includes(stage) ? 1 : 0,
        stage,
      );
      if (stage === "persisted" || stage === "acquire")
        assert.equal(controls.tickets.length, 0, stage);
      // Failure is best-effort, and must not strand the deduplication slot.
      prefetch("page");
      await settle();
      assert.equal(controls.reads.length, 2, stage);
    }
  });

  async function dropFixture() {
    const { commitDatabaseBlockDrop, controls } = await runtime();
    const events = [],
      errors = [];
    const source = {};
    const workspace = {
      drag: {
        active: { editor: source },
        source: () => true,
        transition: (phase) => events.push(phase),
        reset: () => events.push("reset"),
      },
      runtimes: new Map([[source, { getSession: () => ({ pageId: "source-page" }) }]]),
      history: { attachResource: (_, receipt) => events.push(["history", receipt]) },
      getEditor: () => editor,
    };
    const editor = { isDestroyed: false, isEditable: true, view: { workspace } };
    const receipt = {
      undo: async () => {
        events.push("undo");
      },
      redo: async () => {},
    };
    const input = {
      editor,
      workspace,
      mode: "copy",
      pendingDrop: {
        databaseId: "database",
        payload: { operationId: "operation" },
        anchor: { resolve: () => 1 },
      },
      actions: {
        onEmbedDatabase: () => {
          events.push("embed");
          return Promise.resolve(receipt);
        },
        onMoveDatabase: (id, pageId) => {
          events.push(["move", id, pageId]);
          return Promise.resolve(receipt);
        },
      },
      onComplete: () => events.push("complete"),
      onError: (message) => errors.push(message),
      onSettled: () => events.push("settled"),
    };
    return {
      input,
      events,
      errors,
      receipt,
      controls,
      run: () => commitDatabaseBlockDrop(input),
    };
  }

  test("database drop commits resource history in order and releases pending state", async () => {
    for (const mode of ["copy", "move"]) {
      const { input, events, errors, receipt, run } = await dropFixture();
      input.mode = mode;
      const operation = run();
      assert.deepEqual(events, [mode === "copy" ? "embed" : ["move", "database", "source-page"]]);
      await operation;
      assert.deepEqual(events.slice(1), [
        "committing",
        "completed",
        "reset",
        ["history", receipt],
        "complete",
        "settled",
      ]);
      assert.deepEqual(errors, []);
    }
  });

  test("database drop compensates when the destination disappears and waits for undo before cleanup", async () => {
    const { input, events, errors, receipt, run } = await dropFixture();
    const creation = deferred(),
      undo = deferred();
    input.actions.onEmbedDatabase = () => creation.promise;
    receipt.undo = () => {
      events.push("undo");
      return undo.promise;
    };
    const operation = run();
    input.editor.isDestroyed = true;
    creation.resolve(receipt);
    await settle();
    assert.deepEqual(events, ["undo"]);
    undo.resolve();
    await operation;
    assert.deepEqual(events, ["undo", "settled"]);
    assert.deepEqual(errors, ["Could not create the linked database view."]);
  });

  test("database drop reports synchronous, rejected and compensation failures and always settles", async () => {
    for (const stage of ["sync", "async", "undo", "transfer"]) {
      const { input, events, errors, receipt, controls, run } = await dropFixture();
      const failure = new Error(stage);
      if (stage === "sync")
        input.actions.onEmbedDatabase = () => {
          throw failure;
        };
      if (stage === "async") input.actions.onEmbedDatabase = () => Promise.reject(failure);
      if (stage === "undo") {
        input.actions.onEmbedDatabase = () => {
          input.editor.isDestroyed = true;
          return Promise.resolve(receipt);
        };
        receipt.undo = () => {
          throw failure;
        };
      }
      if (stage === "transfer")
        controls.transfer = () => {
          throw failure;
        };
      await run();
      assert.deepEqual(errors, [stage]);
      assert.equal(events.at(-1), "settled");
      assert.equal(events.includes("complete"), false);
    }
  });
  test("database drop finalizer errors override a throwing error reporter", async () => {
    const { input, run } = await dropFixture();
    const body = new Error("create"),
      report = new Error("report"),
      cleanup = new Error("cleanup");
    input.actions.onEmbedDatabase = () => Promise.reject(body);
    input.onError = () => {
      throw report;
    };
    input.onSettled = () => {
      throw cleanup;
    };
    await assert.rejects(run(), (error) => error === cleanup);
  });
}

async function loadWorkflows(sourcePath) {
  const mocks = {
    "workflow-test-ports": `
      export const controls = {
        userId: "user", online: true, events: [], reads: [], acquired: [], released: [], tickets: [], initialized: [],
        queryTask: Promise.resolve(),
        entry: { document: {}, hasPersistedState: false, persistenceError: null, flush: () => Promise.resolve() },
        acquire() { return Promise.resolve(this.entry); }, ticket: () => Promise.resolve({}), apply() {}, initialize: () => Promise.resolve(), transfer: () => ({ ok: true }),
      };
    `,
    "@/app/query-client": `import { controls } from "workflow-test-ports"; export const queryClient = { getQueryData: () => ({ user: { id: controls.userId } }), prefetchQuery: ({ pageId }) => { controls.reads.push(pageId); return controls.queryTask; } };`,
    "@/platform/network/connectivity": `import { controls } from "workflow-test-ports"; export const getConnectivityState = () => controls.online ? "online" : "offline";`,
    "@/platform/network/api": `export const apiFetch = () => {};`,
    "@zilobase/features/pages": `import { controls } from "workflow-test-ports"; export const pageQueryOptions = (_, pageId) => ({ pageId }); export const pageCollaborationTicket = (_, id) => { controls.tickets.push(id); return controls.ticket(); };`,
    "@zilobase/features/auth": `export const sessionQueryKey = ["session"];`,
    "./page-document-cache": `import { controls } from "workflow-test-ports"; export const acquirePageDocument = (user, page) => { controls.acquired.push([user, page]); return controls.acquire(); }; export const releasePageDocument = (entry) => controls.released.push(entry); export const markPageDocumentInitialized = (entry) => { controls.initialized.push(entry); return controls.initialize(); };`,
    "./collaboration-connection": `import { controls } from "workflow-test-ports"; export const applyTicketState = (...args) => controls.apply(...args);`,
    "../../extensions/lib/editor-integration": `export const workspaceForView = (view) => view.workspace;`,
    "../../runtime/lib/editor-workspace": `export const isCopyDrag = () => false;`,
    "../../operations/lib/block-operations": `import { controls } from "workflow-test-ports"; export const transferBlocks = (...args) => controls.transfer(...args);`,
    sonner: `export const toast = { error: () => {} };`,
  };
  const result = await build({
    stdin: {
      contents: `export { prefetchPageForNavigation } from "./collaboration/lib/page-prefetch"; export { commitDatabaseBlockDrop } from "./drag-drop/lib/block-drop"; export { controls } from "workflow-test-ports";`,
      resolveDir: sourcePath("/src/sections/pages/editor"),
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "editor-workflow-ports",
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) =>
            path in mocks ? { path, namespace: "workflow-mock" } : undefined,
          );
          builder.onLoad({ filter: /./, namespace: "workflow-mock" }, ({ path }) => ({
            contents: mocks[path],
            loader: "ts",
          }));
        },
      },
    ],
  });
  const directory = await mkdtemp(join(tmpdir(), "zilobase-editor-workflows-"));
  try {
    const file = join(directory, "workflows.mjs");
    await writeFile(file, result.outputFiles[0].text);
    return await import(pathToFileURL(file).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
