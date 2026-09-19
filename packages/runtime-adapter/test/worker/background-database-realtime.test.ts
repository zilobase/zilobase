import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adapter: null as Record<string, (...args: any[]) => any> | null,
  processTask: vi.fn(),
}));

vi.mock("@zilobase/server/adapter-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zilobase/server/adapter-api")>();
  return {
    ...actual,
    getBackgroundCellId: vi.fn(() => "default"),
    parseBackgroundTask: vi.fn((task: unknown) => ({ ok: true, task })),
    processBackgroundTask: mocks.processTask,
    runWithBackgroundTraceContext: vi.fn(
      async (_task: unknown, operation: () => Promise<unknown>) => operation(),
    ),
    runWithDbEnv: vi.fn(
      async (_env: unknown, operation: () => Promise<unknown>) => operation(),
    ),
    runWithRuntimeAdapter: vi.fn(
      async (_adapter: unknown, operation: () => Promise<unknown>) => operation(),
    ),
    setRuntimeAdapter: vi.fn((adapter: typeof mocks.adapter) => {
      mocks.adapter = adapter;
    }),
  };
});

import { createBackgroundWorker } from "../../src/worker/background-worker";
import { createWorkerAdapter } from "../../src/worker/adapter";

const backgroundWorker = createBackgroundWorker();

const task = {
  availableAt: "2026-09-14T00:00:00.000Z",
  cellId: "default",
  kind: "realtime.database" as const,
  resourceId: "outbox-1",
  version: 1 as const,
};

const event = {
  actorId: "user-1",
  areas: ["records" as const],
  changes: { removedRecordIds: ["row-1"] },
  commandId: "command-1",
  committedAt: "2026-09-14T00:00:00.000Z",
  databaseId: "database-1",
  dataSourceId: "source-1",
  eventId: "event-1",
  protocolVersion: 2 as const,
  type: "database.mutation" as const,
  version: 1,
};

beforeEach(() => {
  mocks.processTask.mockReset();
});

describe("database realtime queue delivery", () => {
  it("acknowledges API enqueue before the background Worker publishes to the room", async () => {
    const queued: unknown[] = [];
    const publishMutation = vi.fn(async () => undefined);
    const env = {
      BACKGROUND_FAST: {
        async send(message: unknown) {
          queued.push(message);
        },
      },
      DATABASE_COLLABORATION: {
        getByName: vi.fn(() => ({ publishMutation })),
      },
    };
    const apiAdapter = createWorkerAdapter();

    await apiAdapter.dispatchBackgroundTasks?.({ env, tasks: [task] });
    expect(queued).toEqual([task]);
    expect(publishMutation).not.toHaveBeenCalled();
    expect(apiAdapter.publishDatabaseMutation).toBeUndefined();

    mocks.processTask.mockImplementationOnce(async () => {
      await mocks.adapter?.publishDatabaseMutation({ env, event });
      return { outcome: "completed" };
    });
    const message = queueMessage(queued[0]);
    await backgroundWorker.queue(
      { messages: [message], queue: "zilobase-background-fast" } as never,
      env as never,
    );

    expect(publishMutation).toHaveBeenCalledWith(event);
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("retries recoverable database delivery without acknowledging the message", async () => {
    mocks.processTask.mockResolvedValueOnce({
      availableAt: new Date(Date.now() + 5_000).toISOString(),
      outcome: "retry",
    });
    const message = queueMessage(task);

    await backgroundWorker.queue(
      { messages: [message], queue: "zilobase-background-fast" } as never,
      {} as never,
    );

    expect(message.retry).toHaveBeenCalledWith({
      delaySeconds: expect.any(Number),
    });
    expect(message.ack).not.toHaveBeenCalled();
  });
});

function queueMessage(body: unknown) {
  return {
    ack: vi.fn(),
    body,
    id: "message-1",
    retry: vi.fn(),
  };
}
