import {
  env,
  evictAllDurableObjects,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import * as Y from "yjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MeetingCollaborationRoom } from "../../../src/worker/features/collaboration/meeting-collaboration-room";

afterEach(() => evictAllDurableObjects({ webSockets: "close" }));

describe("MeetingCollaborationRoom in the Workers runtime", () => {
  it("keeps recorder ownership in SQLite across object eviction", async () => {
    const stub = env.MEETING_COLLABORATION.getByName("meeting:recorder-state");
    const claimed = await stub.claimRecorder({
      meetingId: "recorder-state",
      recorderName: "Recorder One",
      userId: "user-1",
      workspaceId: "workspace-1",
    });

    await evictDurableObject(stub);

    await expect(stub.getRecorderState()).resolves.toMatchObject({
      leaseId: claimed.leaseId,
      recorderId: "user-1",
      recorderName: "Recorder One",
      status: "claimed",
    });
  });

  it("rejects recorder actions that do not match the durable session state", async () => {
    const stub = env.MEETING_COLLABORATION.getByName("meeting:recorder-transitions");
    const claimed = await stub.claimRecorder({
      meetingId: "recorder-transitions",
      recorderName: "Recorder One",
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    const input = {
      leaseId: claimed.leaseId,
      meetingId: "recorder-transitions",
      userId: "user-1",
    };

    const invalidTransition = await runInDurableObject(
      stub,
      (instance: MeetingCollaborationRoom) => {
        try {
          instance.transitionRecorder({ ...input, action: "pause" });
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
    );
    expect(invalidTransition).toBe("Cannot pause a claimed recorder session");
    await expect(stub.transitionRecorder({
      ...input,
      action: "start",
    })).resolves.toMatchObject({ status: "recording" });
    await expect(stub.transitionRecorder({
      ...input,
      action: "pause",
    })).resolves.toMatchObject({ status: "paused" });
  });

  it("rejects client transcript writes while allowing notes during recording", async () => {
    const stub = env.MEETING_COLLABORATION.getByName("meeting:write-guard");
    await stub.claimRecorder({
      meetingId: "write-guard",
      recorderName: "Recorder One",
      userId: "user-1",
      workspaceId: "workspace-1",
    });

    await runInDurableObject(stub, async (instance: MeetingCollaborationRoom) => {
      const hocuspocus = (instance as unknown as {
        hocuspocus: { configuration: { extensions: Array<{
          beforeSync?: (input: {
            document: Y.Doc;
            payload: Uint8Array;
            type: number;
          }) => Promise<void>;
        }> } };
      }).hocuspocus;
      const guard = hocuspocus.configuration.extensions.find(
        (extension) => extension.beforeSync,
      )?.beforeSync;
      expect(guard).toBeTypeOf("function");
      if (!guard) return;

      const server = new Y.Doc();
      const transcriptClient = new Y.Doc();
      transcriptClient.getXmlFragment("transcript").insert(
        0,
        [new Y.XmlElement("paragraph")],
      );
      await expect(guard({
        document: server,
        payload: Y.encodeStateAsUpdate(transcriptClient),
        type: 2,
      })).rejects.toThrow("Transcript is read-only");

      const notesClient = new Y.Doc();
      notesClient.getXmlFragment("notes").insert(
        0,
        [new Y.XmlElement("paragraph")],
      );
      await expect(guard({
        document: server,
        payload: Y.encodeStateAsUpdate(notesClient),
        type: 2,
      })).resolves.toBeUndefined();
      server.destroy();
      transcriptClient.destroy();
      notesClient.destroy();
    });
  });

  it("uses an alarm to release an abandoned unstarted claim", async () => {
    const stub = env.MEETING_COLLABORATION.getByName("meeting:claim-alarm");
    await stub.claimRecorder({
      meetingId: "claim-alarm",
      recorderName: "Recorder One",
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE recorder_session SET expires_at = ? WHERE singleton = 1",
        Date.now() - 1,
      );
    });

    await expect(runDurableObjectAlarm(stub)).resolves.toBe(true);
    await expect(stub.getRecorderState()).resolves.toBeNull();
  });

  it("retries the finalized meeting document from a durable SQLite outbox", async () => {
    const stub = env.MEETING_COLLABORATION.getByName("meeting:document-sync");
    await runInDurableObject(stub, async (instance: MeetingCollaborationRoom) => {
      const roomStorage = (instance as unknown as {
        roomStorage: {
          completeSession(
            documentName: string,
            meetingId: string,
            state: Uint8Array,
          ): void;
          getDocumentSync(): unknown;
        };
        scheduleMaintenance(): Promise<void>;
      }).roomStorage;
      roomStorage.completeSession(
        "meeting:document-sync",
        "document-sync",
        new Uint8Array(),
      );
      expect(roomStorage.getDocumentSync()).not.toBeNull();
      await (instance as unknown as {
        scheduleMaintenance(): Promise<void>;
      }).scheduleMaintenance();
    });

    await expect(runDurableObjectAlarm(stub)).resolves.toBe(true);
    await runInDurableObject(stub, (instance: MeetingCollaborationRoom) => {
      const roomStorage = (instance as unknown as {
        roomStorage: { getDocumentSync(): unknown };
      }).roomStorage;
      expect(roomStorage.getDocumentSync()).toBeNull();
    });
  });

  it("checkpoints only one transcript segment for each source-aware sequence", async () => {
    const stub = env.MEETING_COLLABORATION.getByName("meeting:segment-idempotency");
    const claimed = await stub.claimRecorder({
      meetingId: "segment-idempotency",
      recorderName: "Recorder One",
      userId: "user-1",
      workspaceId: "workspace-1",
    });

    await runInDurableObject(stub, (instance: MeetingCollaborationRoom) => {
      const roomStorage = (instance as unknown as {
        roomStorage: {
          checkpoint(
            recorder: Record<string, unknown>,
            segment: Record<string, unknown>,
            patch: Record<string, unknown>,
          ): { inserted: boolean; recorder: Record<string, unknown> };
          getRecorder(): Record<string, unknown> | null;
          listSegments(leaseId: string): Array<Record<string, unknown>>;
        };
      }).roomStorage;
      const recorder = roomStorage.getRecorder();
      if (!recorder) throw new Error("Expected recorder state");
      const first = roomStorage.checkpoint(recorder, {
        endMs: 120,
        id: "segment-first",
        providerItemId: "provider-first",
        sequence: 11,
        source: "system",
        startMs: 100,
        text: "First copy",
      }, {});
      const duplicate = roomStorage.checkpoint(first.recorder, {
        endMs: 120,
        id: "segment-duplicate",
        providerItemId: "provider-duplicate",
        sequence: 11,
        source: "system",
        startMs: 100,
        text: "Duplicate copy",
      }, {});

      expect(first.inserted).toBe(true);
      expect(duplicate.inserted).toBe(false);
      expect(roomStorage.listSegments(claimed.leaseId)).toMatchObject([{
        id: "segment-first",
        source: "system",
        text: "First copy",
      }]);
    });
  });

  it("keeps retryable provider failures recoverable and rewinds uncommitted audio", async () => {
    const stub = env.MEETING_COLLABORATION.getByName("meeting:provider-retry");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await runInDurableObject(stub, async (instance: MeetingCollaborationRoom) => {
        let providerAborted = false;
        let clientCloseCode: number | undefined;
        const session = {
          activeSources: ["microphone"],
          claims: {
            exp: Date.now() + 60_000,
            leaseId: "lease-provider-retry",
            meetingId: "provider-retry",
            userId: "user-1",
            workspaceId: "workspace-1",
          },
          connection: { document: null },
          disconnectTimer: null,
          failed: false,
          lastDraftPublishedAt: { microphone: 0, system: 0 },
          lastLeaseRefreshAt: Date.now(),
          lastSequences: { microphone: 49, system: -1 },
          latestDrafts: {},
          providerGenerations: { microphone: 3, system: 0 },
          publishTimers: {},
          readySources: new Set(["microphone"]),
          recorder: {
            durationMs: 0,
            expiresAt: Date.now() + 60_000,
            leaseId: "lease-provider-retry",
            meetingId: "provider-retry",
            recorderImage: null,
            recorderName: "Recorder One",
            startedAt: Date.now(),
            status: "recording",
            stoppedAt: null,
            updatedAt: Date.now(),
            userId: "user-1",
            workspaceId: "workspace-1",
          },
          segments: [{
            endMs: 200,
            id: "segment-1",
            providerItemId: "lease-provider-retry:item-1",
            sequence: 0,
            source: "microphone",
            startMs: 0,
            text: "Persisted words",
          }],
          sessionId: "session-provider-retry",
          socket: {
            close(code: number) {
              clientCloseCode = code;
            },
            readyState: WebSocket.OPEN,
          },
          transcribers: new Map([["microphone", {
            abort() {
              providerAborted = true;
            },
          }]]),
        };
        const internals = instance as unknown as {
          audioSession: typeof session | null;
          failAudioSession(
            session: typeof session,
            error: unknown,
            source: "microphone" | "system",
            generation: number,
          ): Promise<void>;
        };
        internals.audioSession = session;

        await internals.failAudioSession(
          session,
          new Error("provider connection reset"),
          "microphone",
          3,
        );

        expect(internals.audioSession).toBe(session);
        expect(session.failed).toBe(false);
        expect(session.readySources.size).toBe(0);
        expect(session.providerGenerations.microphone).toBe(4);
        expect(session.lastSequences.microphone).toBe(9);
        expect(session.transcribers.size).toBe(0);
        expect(providerAborted).toBe(true);
        expect(clientCloseCode).toBe(1011);
      });
    } finally {
      log.mockRestore();
    }
  });

  it("waits for both source transcribers before surfacing a finalization error", async () => {
    const stub = env.MEETING_COLLABORATION.getByName("meeting:parallel-finish");
    await runInDurableObject(stub, async (instance: MeetingCollaborationRoom) => {
      const finished: string[] = [];
      const session = {
        providerGenerations: { microphone: 4, system: 7 },
        readySources: new Set(["microphone", "system"]),
        transcribers: new Map([
          ["microphone", {
            async finish() {
              finished.push("microphone");
              throw new Error("microphone finalization failed");
            },
          }],
          ["system", {
            async finish() {
              await Promise.resolve();
              finished.push("system");
            },
          }],
        ]),
      };
      const internals = instance as unknown as {
        finishSessionTranscribers(value: typeof session): Promise<void>;
      };

      await expect(internals.finishSessionTranscribers(session)).rejects.toThrow(
        "microphone finalization failed",
      );

      expect(finished).toEqual(["microphone", "system"]);
      expect(session.transcribers.size).toBe(0);
      expect(session.readySources.size).toBe(0);
      expect(session.providerGenerations).toEqual({ microphone: 5, system: 8 });
    });
  });

  it("isolates meeting documents and preserves them across hibernation", async () => {
    const stub = env.MEETING_COLLABORATION.getByName("meeting:meeting-1");
    const response = await stub.fetch(
      "https://example.com/meeting-collaboration?document=meeting:meeting-1",
      { headers: { Upgrade: "websocket" } },
    );
    const socket = response.webSocket;
    if (!socket) throw new Error("Expected a WebSocket upgrade");
    socket.accept();

    await evictDurableObject(stub);
    await runInDurableObject(stub, (_instance, state) => {
      expect(state.getWebSockets()).toHaveLength(1);
      expect(state.getWebSockets()[0].deserializeAttachment()).toMatchObject({
        documentName: "meeting:meeting-1",
      });
    });
    socket.close(1000, "done");
  });

  it("restores hibernated clients before broadcasting transcript RPC updates", async () => {
    const stub = env.MEETING_COLLABORATION.getByName("meeting:live-transcript");
    const response = await stub.fetch(
      "https://example.com/meeting-collaboration?document=meeting:live-transcript",
      { headers: { Upgrade: "websocket" } },
    );
    const socket = response.webSocket;
    if (!socket) throw new Error("Expected a WebSocket upgrade");
    socket.accept();

    await runInDurableObject(stub, (_instance, state) => {
      const [server] = state.getWebSockets();
      const attachment = server.deserializeAttachment() as Record<string, unknown>;
      server.serializeAttachment({
        ...attachment,
        authMessage: new Uint8Array([1]).buffer,
      });
    });
    await evictDurableObject(stub);

    await stub.appendMeetingTranscript(
      "live-transcript",
      { id: "segment-1", startMs: 0, text: "Live text" },
      "user-1",
    );

    await runInDurableObject(stub, (instance: MeetingCollaborationRoom) => {
      const hocuspocus = (instance as unknown as {
        hocuspocus: {
          handledConnections: number;
          transcriptAppendCalls: number;
        };
      }).hocuspocus;
      expect(hocuspocus.handledConnections).toBe(1);
      expect(hocuspocus.transcriptAppendCalls).toBe(1);
    });
    socket.close(1000, "done");
  });
});
