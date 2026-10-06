import * as Y from "yjs";
export function register({ assert, loadModule, test }) {
  test("document leases share transport and stale release cannot dispose a replacement", async () => {
    const { createDocumentSessionRegistry } = await loadModule(
      "/src/features/editor/collaboration/document-session-registry.ts",
    );
    const registry = createDocumentSessionRegistry();
    let disposed = 0;
    const create = () => ({
      dispose: () => {
        disposed++;
      },
    });
    const a = registry.acquire("deployment:account:page:1", create),
      b = registry.acquire("deployment:account:page:1", create);
    assert.equal(a.session, b.session);
    a.release();
    assert.equal(disposed, 0);
    b.release();
    assert.equal(disposed, 1);
    const next = registry.acquire("deployment:account:page:1", create);
    b.release();
    assert.equal(disposed, 1);
    assert.notEqual(next.session, a.session);
    next.release();
    assert.equal(disposed, 2);
    assert.equal(registry.size, 0);
  });
  async function fixture({ persisted = true, denied = false } = {}) {
    const { createPageDocumentSession } = await loadModule(
      "/src/features/editor/collaboration/page-document-session.ts",
    );
    const document = new Y.Doc();
    const events = [];
    const timers = new Map();
    const originalSet = globalThis.setTimeout,
      originalClear = globalThis.clearTimeout;
    globalThis.setTimeout = (callback, delay) => {
      const token = {};
      timers.set(token, { callback, delay });
      return token;
    };
    globalThis.clearTimeout = (token) => timers.delete(token);
    let online = true,
      connection,
      connectivity;
    const entry = {
      document,
      hasPersistedState: persisted,
      locallyChanged: false,
      persistenceError: null,
      blocked: false,
      errorListeners: new Set(),
      flush: async () => events.push("flush"),
    };
    const session = createPageDocumentSession(
      { user: { id: "a", color: "red", name: "A" }, pageId: "p" },
      {
        acquire: async () => {
          events.push("acquire");
          return entry;
        },
        release: () => events.push("release"),
        initialize: async () => events.push("initialize"),
        unblock: async () => {
          entry.blocked = false;
        },
        verify: async () => {},
        isAccessDenied: (error) => error.message === "denied",
        getTicket: async () => {
          events.push("ticket");
          if (denied) throw new Error("denied");
          return { initialState: "seed" };
        },
        applyTicket: () => {
          events.push("hydrate");
          document.getText("body").insert(0, "server");
        },
        awareness: () => ({ destroy: () => events.push("awareness:destroy") }),
        online: () => online,
        subscribeConnectivity: (listener) => {
          connectivity = listener;
          return () => events.push("unsubscribe");
        },
        schedule: (callback) => {
          callback();
          return () => {};
        },
        connect: ({ publish }) => {
          events.push("connect");
          connection = publish;
          publish({ status: "connecting" });
          return () => events.push("disconnect");
        },
      },
    );
    const flush = async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve();
    };
    await flush();
    return {
      session,
      document,
      entry,
      events,
      flush,
      connection: (patch) => connection(patch),
      online: (value) => {
        online = value;
        connectivity();
      },
      expire: (delay) => {
        for (const [token, timer] of [...timers])
          if (timer.delay === delay) {
            timers.delete(token);
            timer.callback();
          }
      },
      timers,
      dispose: () => {
        session.dispose();
        document.destroy();
        globalThis.setTimeout = originalSet;
        globalThis.clearTimeout = originalClear;
      },
    };
  }
  test("cold session hydrates durable Yjs before connection; cached session allows startup typing", async () => {
    for (const persisted of [false, true]) {
      const f = await fixture({ persisted });
      try {
        assert.equal(f.session.getSnapshot().document, f.document);
        assert.equal(f.session.getSnapshot().canEdit, true);
        if (!persisted)
          assert.deepEqual(f.events.slice(0, 5), [
            "acquire",
            "ticket",
            "hydrate",
            "flush",
            "initialize",
          ]);
        else assert.deepEqual(f.events, ["acquire", "connect"]);
        f.document.getText("body").insert(f.document.getText("body").length, "typed");
        f.connection({ status: "connected", synced: true });
        assert.equal(f.session.getSnapshot().canEdit, true);
        f.expire(20_000);
        assert.equal(f.session.getSnapshot().canEdit, true);
        f.online(false);
        assert.equal(f.session.getSnapshot().canEdit, false);
        f.online(true);
        f.connection({ status: "connected", synced: true });
        assert.equal(f.session.getSnapshot().canEdit, true);
        assert.ok(f.document.getText("body").toString().endsWith("typed"));
      } finally {
        f.dispose();
      }
      assert.equal(f.events.filter((event) => event === "release").length, 1);
      assert.equal(f.entry.errorListeners.size, 0);
    }
  });
  test("startup timeout and disconnect lock content until confirmed sync", async () => {
    const f = await fixture();
    try {
      f.expire(20_000);
      assert.equal(f.session.getSnapshot().canEdit, false);
      f.connection({ status: "connected", synced: true });
      assert.equal(f.session.getSnapshot().canEdit, true);
      f.connection({ status: "disconnected", synced: false });
      assert.equal(f.session.getSnapshot().canEdit, false);
      f.expire(3_000);
      assert.equal(f.events.filter((event) => event === "connect").length, 2);
    } finally {
      f.dispose();
    }
  });
  test("cold authorization denial blocks retries and retains no transport", async () => {
    const f = await fixture({ persisted: false, denied: true });
    try {
      assert.equal(f.session.getSnapshot().status, "blocked");
      assert.equal(f.session.getSnapshot().canEdit, false);
      assert.equal(f.events.includes("connect"), false);
      assert.equal(f.events.filter((event) => event === "release").length, 1);
      assert.equal(f.timers.size, 0);
    } finally {
      f.dispose();
    }
  });
}
