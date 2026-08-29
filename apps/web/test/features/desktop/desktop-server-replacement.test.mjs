import { readFile } from "node:fs/promises";

export function register({ readSource, assert, loadModule, test }) {
  const currentServer = {
    apiOrigin: "https://old.example.com",
    displayName: "Old",
    instanceId: "old-instance",
    issuer: "https://old.example.com",
    minimumDesktopVersion: "0.0.30",
    protocolVersion: 1,
    serverVersion: "0.0.30",
    webOrigin: "https://old.example.com",
  };
  const prepared = {
    candidateId: "candidate-1",
    server: {
      ...currentServer,
      apiOrigin: "https://new.example.com",
      displayName: "New",
      instanceId: "new-instance",
      issuer: "https://new.example.com",
      webOrigin: "https://new.example.com",
    },
  };

  test("replacement stops old traffic and deletes local state before commit", async () => {
    const { executeDesktopServerReplacement } = await loadModule(
      "/src/features/desktop/server/desktop-server-replacement-core.ts",
    );
    const order = [];
    await executeDesktopServerReplacement(
      prepared,
      currentServer,
      "/p/page-1",
      {
        beforeLocalCleanup: async () => order.push("unmount"),
        beginNetworkShutdown: () => order.push("stop-network"),
        cancelQueries: async () => order.push("cancel-queries"),
        clearIndexedData: async () => order.push("clear-indexeddb"),
        clearStores: async () => order.push("clear-stores"),
        commitCandidate: async (candidateId) => {
          assert.equal(candidateId, "candidate-1");
          order.push("commit");
          return { changed: true, server: prepared.server };
        },
        destroyRealtime: () => order.push("stop-websockets"),
        forgetCredentials: () => order.push("forget-memory"),
        reload: (path) => order.push(`reload:${path}`),
        revokeOldSession: async (server) => {
          assert.equal(server.apiOrigin, "https://old.example.com");
          order.push("revoke");
        },
      },
    );

    assert.deepEqual(order, [
      "revoke",
      "stop-network",
      "unmount",
      "stop-websockets",
      "cancel-queries",
      "clear-indexeddb",
      "clear-stores",
      "commit",
      "forget-memory",
      "reload:/p/page-1",
    ]);
  });

  test("failed best-effort revocation does not block secure local deletion", async () => {
    const { executeDesktopServerReplacement } = await loadModule(
      "/src/features/desktop/server/desktop-server-replacement-core.ts",
    );
    const order = [];
    await executeDesktopServerReplacement(prepared, currentServer, undefined, {
      beforeLocalCleanup: async () => undefined,
      beginNetworkShutdown: () => order.push("stopped"),
      cancelQueries: async () => undefined,
      clearIndexedData: async () => order.push("deleted"),
      clearStores: async () => undefined,
      commitCandidate: async () => ({ changed: true, server: prepared.server }),
      destroyRealtime: () => undefined,
      forgetCredentials: () => undefined,
      reload: () => undefined,
      revokeOldSession: async () => {
        throw new Error("offline");
      },
    });
    assert.deepEqual(order, ["stopped", "deleted"]);
  });

  test("instance binding rejects a server substituted behind an open link", async () => {
    const { assertPreparedServerMatchesRequest } = await loadModule(
      "/src/features/desktop/server/desktop-server-replacement-core.ts",
    );
    assert.throws(() =>
      assertPreparedServerMatchesRequest(prepared, {
        expectedInstanceId: "another-instance",
        serverUrl: "https://new.example.com",
      }),
    );
  });

  test("network shutdown aborts old requests and blocks new ones", async () => {
    const {
      beginDesktopServerNetworkShutdown,
      desktopNetworkFetch,
      resetDesktopServerNetworkForTests,
    } = await loadModule("/src/features/desktop/network/desktop-network.ts");
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (_input, init) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      });
    };

    try {
      resetDesktopServerNetworkForTests();
      const oldRequest = desktopNetworkFetch("https://old.example.com/health");
      beginDesktopServerNetworkShutdown();
      await assert.rejects(oldRequest, { name: "AbortError" });
      await assert.rejects(
        desktopNetworkFetch("https://old.example.com/ready"),
        { name: "AbortError" },
      );
      assert.equal(calls, 1);
    } finally {
      resetDesktopServerNetworkForTests();
      globalThis.fetch = originalFetch;
    }
  });

  test("replacement clears every server-scoped store and supports both deep-link launch modes", async () => {
    const replacement = await readSource("/src/features/desktop/server/desktop-server-replacement.ts");
    const controller = await readSource("/src/features/desktop/components/desktop-server-replacement-controller.tsx");
    const handler = await readSource("/src/features/desktop/components/desktop-deep-link-handler.tsx");

    assert.match(replacement, /queryClient\.clear\(\)/);
    assert.match(replacement, /resetAccountState\(\)/);
    assert.match(replacement, /clearAuthFlow\(\)/);
    assert.match(replacement, /useAppStore\.persist\.clearStorage\(\)/);
    assert.match(replacement, /useAuthFlowStore\.persist\.clearStorage\(\)/);
    assert.match(replacement, /window\.sessionStorage\.clear\(\)/);
    assert.match(controller, /Sync drafts and change/);
    assert.match(controller, /Export recovery and change/);
    assert.match(controller, /Discard drafts/);
    assert.match(controller, /Cancel/);
    assert.match(handler, /getCurrent\(\)/);
    assert.match(handler, /onOpenUrl\(openFirstValidPath\)/);
  });
}
