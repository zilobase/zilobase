import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  acceptAgentEvent,
  dispatchDatabaseAgentMutationFacts,
  dispatchMeetingCompletedAgentTriggers,
  dispatchPageCommentAgentTriggers,
  enqueueDueAgentSchedules,
  listAgentTriggers,
  removeAgentTrigger,
  rotateAgentWebhookSecret,
  upsertAgentTrigger,
} from "./agent-trigger-service";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  writes: [] as unknown[],
  access: vi.fn(),
  role: vi.fn(),
  revision: vi.fn(),
  apply: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("../../access", () => ({
  canAgentAccessDatabase: state.access,
  canAgentAccessPage: state.access,
}));
vi.mock("./agent-profile-service", async (original) => ({
  ...(await original<typeof import("./agent-profile-service")>()),
  requireAgentProfileRole: state.role,
}));
vi.mock("./agent-revision-service", () => ({
  getCurrentAgentRevision: state.revision,
  applyAgentDefinition: state.apply,
}));
vi.mock("../execution/agent-run-queue", () => ({ enqueueAgentRun: state.enqueue }));
vi.mock("../../automations/actions/secret-crypto", () => ({
  encryptAutomationSecret: async () => ({ ciphertext: "encrypted" }),
}));
vi.mock("../../../infrastructure/database", () => {
  function query() {
    const q = {
      from: () => q,
      innerJoin: () => q,
      orderBy: () => q,
      where: () => q,
      limit: () => q,
      then: (resolve: (value: unknown) => unknown) =>
        resolve(state.rows.shift() ?? []),
    };
    return q;
  }
  const db = {
    select: query,
    update: () => ({
      set: (value: unknown) => {
        state.writes.push(value);
        return { where: async () => undefined };
      },
    }),
    delete: () => ({ where: async () => undefined }),
    insert: () => ({
      values: (value: unknown) => {
        state.writes.push(value);
        const q = {
          onConflictDoNothing: () => q,
          then: (resolve: (value: unknown) => unknown) => resolve([]),
        };
        return q;
      },
    }),
    transaction: async (callback: (tx: unknown) => unknown): Promise<unknown> =>
      callback(db),
  };
  return { db };
});

const env = {
  AI_CUSTOM_AGENTS_ENABLED: "true",
  AI_CUSTOM_AGENT_TRIGGERS_ENABLED: "true",
};
const input = {
  env,
  profileId: "agent",
  userId: "user",
  workspaceId: "workspace",
};
const trigger = {
  id: "trigger",
  profileId: "agent",
  revisionId: "revision",
  kind: "manual" as const,
  config: {},
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};
const event = {
  ...input,
  eventKey: "event",
  payload: { data: "untrusted" },
  triggerId: "trigger",
};
const fact = {
  dataSourceId: "source",
  pageId: "page",
  rowId: "row",
  changedValues: [{ propertyId: "status", before: "todo", after: "done" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
  state.writes = [];
  state.access.mockResolvedValue(true);
  state.revision.mockResolvedValue({
    definition: { name: "Agent", triggers: [] },
  });
  state.enqueue.mockResolvedValue({ id: "run" });
});

describe("agent trigger registration and durable delivery", () => {
  it("lists serialized triggers only after authorizing the viewer", async () => {
    state.rows = [[trigger]];
    expect((await listAgentTriggers(input))[0]).toMatchObject({
      id: "trigger",
      lastRunAt: null,
    });
    expect(state.role).toHaveBeenCalledWith({ ...input, minimum: "user" });
  });
  it.each(["connector", "slack"] as const)(
    "rejects unimplemented %s event adapters",
    async (kind) => {
      state.rows = [[{ currentRevisionId: "revision" }]];
      await expect(
        upsertAgentTrigger({ ...input, kind, config: {}, label: "Trigger" }),
      ).rejects.toThrow("adapter");
    },
  );
  it.each([0, 4, 525601, NaN, Infinity, "5"])(
    "rejects invalid custom schedule interval %s",
    async (intervalMinutes) => {
      state.rows = [[{ currentRevisionId: "revision" }]];
      await expect(
        upsertAgentTrigger({
          ...input,
          kind: "schedule",
          config: { cadence: "custom", intervalMinutes },
          label: "Schedule",
        }),
      ).rejects.toThrow("interval");
    },
  );
  it("creates triggers through the immutable definition service", async () => {
    state.rows = [[{ currentRevisionId: "revision" }], [trigger]];
    await upsertAgentTrigger({
      ...input,
      kind: "schedule",
      config: { cadence: "daily" },
      label: "Daily",
    });
    expect(state.apply.mock.calls[0]![0].definition.triggers[0]).toMatchObject({
      kind: "schedule",
      label: "Daily",
      status: "active",
    });
  });
  it("preserves a paused trigger when editing its configuration", async () => {
    state.rows = [
      [{ currentRevisionId: "revision" }],
      [{ ...trigger, status: "paused" }],
      [trigger],
    ];
    await upsertAgentTrigger({
      ...input,
      triggerId: "trigger",
      kind: "manual",
      config: {},
      label: "Edited",
    });
    expect(state.apply.mock.calls[0]![0].definition.triggers[0].status).toBe(
      "paused",
    );
  });
  it.each(["database", "comment", "mention", "meeting"] as const)(
    "requires a resource grant for %s",
    async (kind) => {
      state.access.mockResolvedValue(false);
      state.rows = [[{ currentRevisionId: "revision" }], [{ pageId: "page" }]];
      await expect(
        upsertAgentTrigger({
          ...input,
          kind,
          config: { databaseId: "db", pageId: "page", meetingId: "meeting" },
          label: "Restricted",
        }),
      ).rejects.toThrow("Grant");
      expect(state.apply).not.toHaveBeenCalled();
    },
  );
  it("rejects forged trigger identifiers", async () => {
    state.rows = [[{ currentRevisionId: "revision" }], []];
    await expect(
      upsertAgentTrigger({
        ...input,
        triggerId: "forged",
        kind: "manual",
        config: {},
        label: "Edited",
      }),
    ).rejects.toThrow("not found");
  });
  it("removes a trigger through a new revision", async () => {
    state.revision.mockResolvedValueOnce({
      definition: { triggers: [{ id: "trigger" }, { id: "keep" }] },
    });
    state.rows = [[trigger], []];
    await removeAgentTrigger({ ...input, triggerId: "trigger" });
    expect(state.apply.mock.calls[0]![0].definition.triggers).toEqual([
      { id: "keep" },
    ]);
  });
  it("rotates webhook secrets without storing their plaintext", async () => {
    state.rows = [[{ ...trigger, kind: "webhook", webhookSecretId: "old" }]];
    const { secret } = await rotateAgentWebhookSecret({
      ...input,
      triggerId: "trigger",
    });
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(state.writes)).not.toContain(secret);
    await expect(
      rotateAgentWebhookSecret({ ...input, triggerId: "missing" }),
    ).rejects.toThrow("not found");
  });
  it("recovers a receipt reserved before a queueing failure", async () => {
    state.rows = [[{ trigger }], [{ id: "previous-attempt", runId: null }]];
    expect(await acceptAgentEvent(event)).toEqual({
      duplicate: false,
      run: { id: "run" },
    });
    expect(state.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        occurrenceKey: "event",
        revisionId: "revision",
        input: { triggerPayload: event.payload },
      }),
    );
  });
  it("does not queue a second run for a delivered event", async () => {
    state.rows = [[{ trigger }], [{ id: "receipt", runId: "run" }]];
    expect(await acceptAgentEvent(event)).toEqual({
      duplicate: true,
      run: null,
    });
    expect(state.enqueue).not.toHaveBeenCalled();
  });
  it("rejects missing triggers", async () => {
    await expect(acceptAgentEvent(event)).rejects.toThrow("unavailable");
  });
  it("advances successful schedules and degrades failed schedules", async () => {
    const scheduled = {
      ...trigger,
      kind: "schedule",
      nextRunAt: new Date("2026-01-01T00:00:00Z"),
    };
    state.rows = [
      [{ trigger: scheduled, workspaceId: "workspace" }],
      [{ trigger: scheduled }],
      [{ id: "receipt" }],
    ];
    expect(
      await enqueueDueAgentSchedules(env, new Date("2026-01-01T00:00:00Z")),
    ).toBe(1);
    expect(state.writes.at(-1)).toMatchObject({
      nextRunAt: new Date("2026-01-02T00:00:00Z"),
    });
    state.rows = [[{ trigger: scheduled, workspaceId: "workspace" }], []];
    await enqueueDueAgentSchedules(env);
    expect(state.writes.at(-1)).toMatchObject({
      status: "degraded",
      nextRunAt: null,
    });
  });
  it("keeps native triggers disabled by default", async () => {
    expect(
      await dispatchDatabaseAgentMutationFacts(
        {},
        { eventKeyPrefix: "mutation", facts: [fact] },
      ),
    ).toEqual({ accepted: 0 });
    expect(
      await dispatchMeetingCompletedAgentTriggers(
        {},
        { meetingId: "meeting", occurrenceKey: "done" },
      ),
    ).toEqual({ accepted: 0 });
    expect(
      await dispatchPageCommentAgentTriggers(
        {},
        { pageId: "page", nextState: new Uint8Array() },
      ),
    ).toEqual({ accepted: 0 });
  });
  it("dispatches matching database changes and preserves event identity", async () => {
    const dbTrigger = {
      ...trigger,
      kind: "database",
      config: {
        databaseId: "database",
        event: "property_changed",
        propertyId: "status",
      },
    };
    state.rows = [
      [
        {
          dataSourceId: "source",
          databaseId: "database",
          workspaceId: "workspace",
        },
      ],
      [{ trigger: dbTrigger }],
      [{ trigger: dbTrigger }],
      [{ id: "receipt" }],
    ];
    expect(
      await dispatchDatabaseAgentMutationFacts(env, {
        eventKeyPrefix: "mutation",
        facts: [fact],
      }),
    ).toEqual({ accepted: 1 });
    expect(state.enqueue.mock.calls[0]![0].occurrenceKey).toBe(
      "mutation:0:trigger",
    );
  });
  it("does not recursively trigger the originating agent", async () => {
    state.rows = [
      [
        {
          dataSourceId: "source",
          databaseId: "database",
          workspaceId: "workspace",
        },
      ],
      [{ trigger: { ...trigger, kind: "database" } }],
      [{ profileId: "agent", chainDepth: 1 }],
    ];
    expect(
      await dispatchDatabaseAgentMutationFacts(env, {
        eventKeyPrefix: "mutation",
        facts: [{ ...fact, origin: "ai", actorId: "agent:agent:run:run" }],
      }),
    ).toEqual({ accepted: 0 });
    expect(state.enqueue).not.toHaveBeenCalled();
  });
  it("dispatches meeting completion only to agents with page access", async () => {
    state.rows = [
      [{ pageId: "page", workspaceId: "workspace" }],
      [{ trigger: { ...trigger, kind: "meeting" } }],
      [{ trigger }],
      [{ id: "receipt" }],
    ];
    expect(
      await dispatchMeetingCompletedAgentTriggers(env, {
        meetingId: "meeting",
        occurrenceKey: "done",
      }),
    ).toEqual({ accepted: 1 });
    state.access.mockResolvedValue(false);
    state.rows = [
      [{ pageId: "page", workspaceId: "workspace" }],
      [{ trigger: { ...trigger, kind: "meeting" } }],
    ];
    expect(
      await dispatchMeetingCompletedAgentTriggers(env, {
        meetingId: "meeting",
        occurrenceKey: "done",
      }),
    ).toEqual({ accepted: 0 });
  });
  it("dispatches new mentions but not existing Yjs comments", async () => {
    const document = new Y.Doc();
    const thread = new Y.Map();
    const messages = new Y.Map();
    const message = new Y.Map();
    document.getMap("commentThreads").set("thread", thread);
    thread.set("messages", messages);
    messages.set("message", message);
    message.set("body", "@Agent please help");
    message.set("author", { id: "user" });
    const nextState = Y.encodeStateAsUpdate(document);
    state.rows = [
      [{ workspaceId: "workspace" }],
      [{ name: "Agent", trigger: { ...trigger, kind: "mention" } }],
      [{ trigger }],
      [{ id: "receipt" }],
    ];
    expect(
      await dispatchPageCommentAgentTriggers(env, {
        pageId: "page",
        nextState,
      }),
    ).toEqual({ accepted: 1 });
    state.rows = [[{ workspaceId: "workspace" }]];
    expect(
      await dispatchPageCommentAgentTriggers(env, {
        pageId: "page",
        nextState,
        previousState: nextState,
      }),
    ).toEqual({ accepted: 0 });
    document.destroy();
  });
});
