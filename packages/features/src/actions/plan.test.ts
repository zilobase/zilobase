import assert from "node:assert/strict";
import test from "node:test";

import { isPlanRejection, rejectPlan, runPlan, type ActionPlan } from "./plan";

type Ops = {
  create: (input: { name: string; onOptimistic?: (value: { id: string }) => void }) => Promise<{
    id: string;
  }>;
  link: (input: { id: string }) => Promise<string>;
};

function harness(options: { preview?: boolean; fail?: string[] } = {}) {
  const calls: Array<{ op: string; input: unknown; optimistic: boolean }> = [];
  const pending: Array<() => void> = [];
  const ops: Ops = {
    create: (input) => {
      const { onOptimistic, ...rest } = input;
      calls.push({ op: "create", input: rest, optimistic: Boolean(onOptimistic) });
      if (options.preview) onOptimistic?.({ id: `preview-${rest.name}` });
      return new Promise((resolve, reject) =>
        pending.push(() =>
          options.fail?.includes(rest.name)
            ? reject(new Error(rest.name))
            : resolve({ id: `saved-${rest.name}` }),
        ),
      );
    },
    link: (input) => {
      calls.push({ op: "link", input, optimistic: false });
      return Promise.resolve(`linked-${input.id}`);
    },
  };
  const flush = async () => {
    for (let index = 0; index < 5; index += 1) {
      await new Promise((resolve) => setTimeout(resolve));
      while (pending.length) pending.shift()!();
    }
  };
  return { calls, ops, flush };
}

const chain: ActionPlan<Ops> = {
  select: "first",
  steps: [
    { id: "first", op: "create", input: () => ({ name: "a" }), admit: "optimistic", failure: "A" },
    { op: "link", input: (done) => ({ id: done.get<{ id: string }>("first").id }) },
  ],
};

test("optimistic steps continue on preview and select once", async () => {
  const { calls, ops, flush } = harness({ preview: true });
  const selected: unknown[] = [];
  const running = runPlan(chain, ops, { onSelect: (value) => selected.push(value) });
  await flush();
  const run = await running;
  assert.equal(run.status, "completed");
  assert.deepEqual(calls, [
    { op: "create", input: { name: "a" }, optimistic: true },
    { op: "link", input: { id: "preview-a" }, optimistic: false },
  ]);
  assert.deepEqual(selected, [{ id: "preview-a" }]);
  assert.deepEqual(run.results.get("first"), { id: "saved-a" });
  assert.equal(run.last, "linked-preview-a");
});

test("sequential execution awaits acknowledgements and never passes previews", async () => {
  const { calls, ops, flush } = harness({ preview: true });
  const running = runPlan(chain, ops, { sequential: true });
  await flush();
  assert.equal((await running).status, "completed");
  assert.deepEqual(calls, [
    { op: "create", input: { name: "a" }, optimistic: false },
    { op: "link", input: { id: "saved-a" }, optimistic: false },
  ]);
});

test("a failure before admission stops the plan and reports its message", async () => {
  const { calls, ops, flush } = harness({ fail: ["a"] });
  const failures: string[] = [];
  const running = runPlan(chain, ops, { onFailure: (message) => failures.push(message) });
  await flush();
  const run = await running;
  assert.equal(run.status, "failed");
  assert.equal((run.error as Error).message, "a");
  assert.deepEqual(failures, ["A"]);
  assert.deepEqual(
    calls.map(({ op }) => op),
    ["create"],
  );
});

test("dispatched steps start without waiting and do not fail the plan", async () => {
  const { calls, ops, flush } = harness({ fail: ["trim"] });
  const running = runPlan<Ops>(
    {
      steps: [
        { op: "create", input: () => ({ name: "trim" }), admit: "dispatch" },
        { op: "link", input: () => ({ id: "x" }) },
      ],
    },
    ops,
  );
  assert.deepEqual(
    calls.map(({ op }) => op),
    ["create", "link"],
  );
  await flush();
  const run = await running;
  assert.equal(run.status, "completed");
  assert.equal(run.errors.length, 1);
  assert.equal(run.error, undefined);
});

test("expired callers stop before issuing later steps", async () => {
  const { calls, ops, flush } = harness();
  let current = true;
  const running = runPlan(chain, ops, { isCurrent: () => current });
  current = false;
  await flush();
  assert.equal((await running).status, "stopped");
  assert.deepEqual(
    calls.map(({ op }) => op),
    ["create"],
  );
});

test("rejections are distinguishable from plans", () => {
  assert.equal(isPlanRejection(rejectPlan("not_editable")), true);
  assert.equal(isPlanRejection(chain), false);
});
