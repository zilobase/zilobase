import { parseHTML } from "linkedom";

export function register({ assert, loadModule, test }) {
  test("kanban real drag and save lifecycle survives slow saves, stale reads, rapid drops and failures", async () => {
    const saved = Object.getOwnPropertyDescriptors(globalThis);
    const { window, document } = parseHTML("<html><body><div id='root'></div></body></html>");
    document.getSelection = () => null;
    const frames = new Map();
    let frameId = 0;
    Object.assign(globalThis, {
      window,
      document,
      HTMLElement: window.HTMLElement,
      Node: window.Node,
      Event: window.Event,
      CustomEvent: window.CustomEvent,
      requestAnimationFrame: (fn) => {
        frames.set(++frameId, fn);
        return frameId;
      },
      cancelAnimationFrame: (id) => frames.delete(id),
      getComputedStyle: () => ({ rowGap: "8", paddingTop: "0" }),
      ResizeObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
    const prototype = window.HTMLElement.prototype;
    const descriptors = Object.getOwnPropertyDescriptors(prototype);
    Object.defineProperties(prototype, {
      offsetHeight: { configurable: true, get: () => 40 },
      offsetTop: {
        configurable: true,
        get() {
          return this.parentElement ? [...this.parentElement.children].indexOf(this) * 48 : 0;
        },
      },
      getBoundingClientRect: {
        configurable: true,
        value: () => ({ top: 0, left: 0, height: 40, width: 200 }),
      },
    });
    const tick = async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const next = [...frames.values()];
      frames.clear();
      next.forEach((fn) => fn(0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const until = async (condition) => {
      for (let i = 0; i < 50 && !condition(); i++) await tick();
      assert.ok(condition(), "lifecycle did not reach expected state");
    };
    let board;
    const initial = { "a:status": "Todo", "b:status": "Done", "c:status": "Done" };
    const done = { ...initial, "a:status": "Done" };
    try {
      const { mountKanbanMoves } = await loadModule(
        "/apps/web/test/support/fixtures/database-kanban-moves.tsx",
      );
      board = mountKanbanMoves(document.getElementById("root"));
      await tick();
      board.drag("a", "Todo", "Done", 1);
      assert.deepEqual(board.read().order, ["b", "a", "c"]);
      assert.equal(board.read().values["a:status"], "Done");
      await until(() => board.requests.length === 1);
      board.refresh(["a", "b", "c"], initial, 1);
      assert.deepEqual(
        board.read().order,
        ["b", "a", "c"],
        "slow POST must not restore the old layout",
      );
      await tick();
      board.drag("a", "Done", "Done", 3);
      assert.deepEqual(board.read().order, ["b", "c", "a"]);
      assert.equal(board.requests.length, 1, "next move waits for the previous save");
      board.requests[0].resolve(2);
      await until(() => board.requests.length === 2);
      assert.deepEqual(board.read().order, ["b", "c", "a"], "ack alone must not clear the draft");
      board.refresh(["b", "a", "c"], done, 2);
      assert.deepEqual(
        board.read().order,
        ["b", "c", "a"],
        "first move's refresh must preserve the second move",
      );
      board.requests[1].resolve(3);
      await tick();
      assert.equal(board.read().pending, true, "keep pending until GET catches up");
      board.refresh(["b", "c", "a"], done, 3);
      assert.equal(board.read().pending, false);
      await tick();

      board.drag("a", "Done", "Todo", 0);
      await until(() => board.requests.length === 3);
      await tick();
      board.drag("b", "Done", "Done", 2);
      assert.deepEqual(board.read().order, ["a", "c", "b"]);
      board.requests[2].reject(Object.assign(new Error("Rejected move"), { status: 403 }));
      await until(() => board.requests.length === 4);
      assert.equal(
        board.read().values["a:status"],
        "Done",
        "only the failed group change rolls back",
      );
      assert.deepEqual(board.read().order, ["c", "b", "a"], "newer move survives the failed move");
      board.requests[3].resolve(4);
      await tick();
      board.refresh(["c", "b", "a"], done, 4);
      assert.equal(board.read().pending, false);

      await tick();
      board.setSorted(async () => {
        throw new Error("Sort save failed");
      });
      board.drag("a", "Done", "Done", 0);
      assert.equal(board.hasSortConfirmation(), true);
      await board.confirm();
      await tick();
      assert.equal(board.requests.length, 4, "a failed sort clear must not send a row move");
      assert.equal(board.hasSortConfirmation(), true, "failed sort clear remains retryable");
    } finally {
      board?.unmount();
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (const key of ["offsetHeight", "offsetTop", "getBoundingClientRect"]) {
        if (descriptors[key]) Object.defineProperty(prototype, key, descriptors[key]);
        else delete prototype[key];
      }
      for (const key of Object.getOwnPropertyNames(globalThis))
        if (!saved[key]) delete globalThis[key];
      Object.defineProperties(globalThis, saved);
    }
  });
}
