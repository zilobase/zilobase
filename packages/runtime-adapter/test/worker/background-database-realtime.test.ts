import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processTask: vi.fn(),
  complete: vi.fn(),
  reschedule: vi.fn(),
  exhausted: vi.fn(),
}));

vi.mock("@zilobase/server/adapter-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@zilobase/server/adapter-api")>();
  return {
    ...actual,
    getBackgroundCellId: vi.fn(() => "default"),
    parseBackgroundTask: vi.fn((task: unknown) => ({ ok: true, task })),
    deliverBackgroundTask: async (_env: unknown, body: unknown, lane: string) =>
      actual.runBackgroundDelivery({
        body,
        cellId: "default",
        lane: lane as never,
        store: {
          load: async () => "ready",
          complete: mocks.complete,
          reschedule: mocks.reschedule,
        },
        execute: mocks.processTask,
      }),
    recordBackgroundExhaustion: mocks.exhausted,
    runWithBackgroundTraceContext: vi.fn(
      async (_task: unknown, operation: () => Promise<unknown>) => operation(),
    ),
    runWithDbEnv: vi.fn(async (_env: unknown, operation: () => Promise<unknown>) => operation()),
  };
});

import { createBackgroundWorker } from "../../src/worker/background-worker";
import { createWorkerJobs } from "../../src/worker/jobs";
import { getRuntimePorts } from "../../src/context";

const backgroundWorker = createBackgroundWorker();

const task = {
  availableAt: "2026-09-14T00:00:00.000Z",
  cellId: "default",
  kind: "realtime.database" as const,
  resourceId: "outbox-1",
  taskId: "00000000-0000-4000-8000-000000000001",
  version: 2 as const,
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
  mocks.complete.mockReset();
  mocks.reschedule.mockReset();
  mocks.exhausted.mockReset();
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
    await createWorkerJobs(env).dispatch([task]);
    expect(queued).toEqual([task]);
    expect(publishMutation).not.toHaveBeenCalled();

    mocks.processTask.mockImplementationOnce(async () => {
      await getRuntimePorts().fanout?.publish(`db:${event.databaseId}`, event);
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

  it("persists business rescheduling and acknowledges the current delivery", async () => {
    mocks.processTask.mockResolvedValueOnce({
      availableAt: new Date(Date.now() + 5_000).toISOString(),
      outcome: "retry",
    });
    const message = queueMessage(task);

    await backgroundWorker.queue(
      { messages: [message], queue: "zilobase-background-fast" } as never,
      {} as never,
    );

    expect(mocks.reschedule).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalledOnce();
  });
  it("records exhaustion before acknowledging a DLQ message", async () => {
    const message = queueMessage(task);
    await backgroundWorker.queue(
      { messages: [message], queue: "zilobase-background-fast-dlq" } as never,
      {} as never,
    );
    expect(mocks.exhausted).toHaveBeenCalledWith({}, task, "fast");
    expect(message.ack).toHaveBeenCalledOnce();
    expect(mocks.processTask).not.toHaveBeenCalled();
  });
  it("retains the DLQ message when durable failure recording fails", async () => {
    mocks.exhausted.mockRejectedValueOnce(new Error("database offline"));
    const message = queueMessage(task);
    await backgroundWorker.queue(
      { messages: [message], queue: "zilobase-background-fast-dlq" } as never,
      {} as never,
    );
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
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
