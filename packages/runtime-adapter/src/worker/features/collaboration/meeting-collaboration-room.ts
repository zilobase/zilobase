import * as Y from "yjs";
import type { Extension } from "@hocuspocus/server";
import {
  appendMeetingTranscriptInHocuspocus,
  appendMeetingTranscriptToDocument,
  createCollaborationHocuspocus,
  createMeetingAudioTicket,
  documentNameForMeeting,
  getOrCreateMeetingCollaborationDocumentState,
  getMeetingOpenAiSafetyIdentifier,
  getMeetingRealtimeTranscriptionConfig,
  getMeetingRealtimeTranscriptionUrl,
  getMeetingTranscriptionFailureCloseCode,
  MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE,
  meetingIdFromDocumentName,
  MeetingRealtimeTranscriber,
  persistMeetingTranscriptSession,
  replaceMeetingSummaryInHocuspocus,
  runWithDbEnv,
  type MeetingRecorderRuntimeState,
  type MeetingTranscriptSessionSegment,
  type MeetingTranscriptYjsSegment,
  type RealtimeTranscriptionSocket,
  type RealtimeTranscriptionTurn,
  trimAcceptedMeetingAudio,
} from "@zilobase/server/adapter-api";
import {
  MEETING_AUDIO_PROTOCOL,
  MEETING_AUDIO_SOURCES,
  meetingAudioSourceFromCode,
  meetingTranscriptSequence,
  type MeetingAudioSource,
  type MeetingAudioTicketClaims,
} from "@zilobase/server/realtime-api";

import { meetingAudioMessageBytes } from "../meeting-audio/message-bytes";
import { readMeetingAudioClaims } from "../meeting-audio/security";
import {
  PageCollaborationRoom,
  type PageCollaborationEnv,
} from "./page-collaboration-room";
import {
  MeetingRoomStorage,
  type MeetingRoomRecorder,
} from "./meeting-room-storage";

const PCM_FRAME_BYTES = 480 * 2;
const AUDIO_PACKET_HEADER_BYTES = 9;
const MAX_FRAME_BYTES = AUDIO_PACKET_HEADER_BYTES + PCM_FRAME_BYTES * 5;
const DRAFT_PUBLISH_INTERVAL_MS = 250;
const RECORDER_CLAIM_TTL_MS = 90_000;
const RECORDER_ACTIVE_TTL_MS = 90_000;
const RECORDER_PAUSED_TTL_MS = 15 * 60_000;
const RECORDER_RECONNECT_GRACE_MS = 10_000;
const AUDIO_TICKET_REFRESH_LEAD_MS = 2 * 60_000;
const DOCUMENT_SYNC_RETRY_MS = 30_000;
const DOCUMENT_SYNC_MAX_RETRY_MS = 5 * 60_000;

type AudioSocketAttachment = {
  claims: MeetingAudioTicketClaims;
  kind: "meeting-audio";
  sessionId: string;
};

type TranscriptDirectConnection = Awaited<ReturnType<
  ReturnType<typeof createCollaborationHocuspocus>["openDirectConnection"]
>>;

type AudioSession = {
  activeSources: MeetingAudioSource[];
  claims: MeetingAudioTicketClaims;
  connection: TranscriptDirectConnection;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  failed: boolean;
  lastDraftPublishedAt: Record<MeetingAudioSource, number>;
  lastLeaseRefreshAt: number;
  lastSequences: Record<MeetingAudioSource, number>;
  latestDrafts: Partial<Record<MeetingAudioSource, RealtimeTranscriptionTurn>>;
  publishTimers: Partial<Record<MeetingAudioSource, ReturnType<typeof setTimeout>>>;
  providerGenerations: Record<MeetingAudioSource, number>;
  readySources: Set<MeetingAudioSource>;
  recorder: MeetingRoomRecorder;
  segments: MeetingTranscriptSessionSegment[];
  sessionId: string;
  socket: WebSocket | null;
  transcribers: Map<MeetingAudioSource, MeetingRealtimeTranscriber>;
};

// One instance is deterministically addressed as `meeting:${meetingId}`. It is
// both the Hocuspocus collaboration room and the only owner of an active
// recording/transcription session for that meeting.
export class MeetingCollaborationRoom extends PageCollaborationRoom {
  private audioSession: AudioSession | null = null;
  private readonly roomStorage: MeetingRoomStorage;

  constructor(ctx: DurableObjectState, env: PageCollaborationEnv) {
    const roomStorage = new MeetingRoomStorage(ctx.storage);
    super(ctx, env, {
      load: (documentName) =>
        loadMeetingRoomDocument(roomStorage, documentName, env),
      store: ({ documentName, state }) => {
        roomStorage.storeDocument(documentName, state);
        return Promise.resolve();
      },
    });
    this.roomStorage = roomStorage;
    this.hocuspocus.configuration.extensions.push(
      meetingTranscriptWriteGuard(roomStorage),
    );
    ctx.blockConcurrencyWhile(async () => {
      this.roomStorage.migrate();
    });
  }

  protected override parseDocumentId(documentName: string) {
    return meetingIdFromDocumentName(documentName);
  }

  protected override getAdditionalMaintenanceAt() {
    const recorderAt = this.roomStorage.getRecorder()?.expiresAt ?? null;
    const documentSyncAt = this.roomStorage.getDocumentSync()?.nextAttemptAt ?? null;
    if (recorderAt === null) return documentSyncAt;
    if (documentSyncAt === null) return recorderAt;
    return Math.min(recorderAt, documentSyncAt);
  }

  protected override async runAdditionalMaintenance(now: number) {
    const documentSync = this.roomStorage.getDocumentSync();
    if (documentSync && documentSync.nextAttemptAt <= now) {
      try {
        await runWithDbEnv(this.env, () => persistMeetingTranscriptSession({
          meetingId: documentSync.meetingId,
          segments: [],
          yjsState: documentSync.state,
        }));
        this.roomStorage.completeDocumentSync(documentSync.updatedAt);
      } catch (error) {
        this.roomStorage.retryDocumentSync(
          documentSync,
          now + documentSyncRetryDelay(documentSync.attempts),
        );
        console.error(JSON.stringify({
          attempts: documentSync.attempts + 1,
          error: error instanceof Error ? error.message : String(error),
          event: "meeting_document_sync_failed",
          meetingId: documentSync.meetingId,
        }));
      }
    }

    const recorder = this.roomStorage.getRecorder();
    if (!recorder || recorder.expiresAt > now) return;

    const session = this.audioSession;
    if (
      session?.recorder.leaseId === recorder.leaseId &&
      session.socket?.readyState === WebSocket.OPEN
    ) {
      session.recorder = this.roomStorage.updateRecorder(recorder, {
        expiresAt: now + (recorder.status === "paused"
          ? RECORDER_PAUSED_TTL_MS
          : RECORDER_ACTIVE_TTL_MS),
      });
      if (session.claims.exp - now <= AUDIO_TICKET_REFRESH_LEAD_MS) {
        await this.refreshAudioTicket(session);
      }
      return;
    }

    if (session?.recorder.leaseId === recorder.leaseId) {
      await this.finishAudioSession(session, {
        durationMs: Math.max(recorder.durationMs, audioSessionDurationMs(session)),
      });
      return;
    }

    await this.finalizeStoredRecorder(recorder);
  }

  override async fetch(request: Request) {
    return this.runWithRoomRuntime(() => this.handleMeetingFetch(request));
  }

  private async handleMeetingFetch(request: Request) {
    const claims = readMeetingAudioClaims(request.headers);
    return claims && new URL(request.url).pathname === "/meeting-audio"
      ? this.openAudioSession(claims)
      : super.fetch(request);
  }

  override async webSocketMessage(
    ws: WebSocket,
    rawMessage: string | ArrayBuffer,
  ) {
    return this.runWithRoomRuntime(() =>
      this.handleMeetingWebSocketMessage(ws, rawMessage));
  }

  private async handleMeetingWebSocketMessage(
    ws: WebSocket,
    rawMessage: string | ArrayBuffer,
  ) {
    const attachment = readAudioAttachment(ws);
    if (!attachment) return super.webSocketMessage(ws, rawMessage);

    const session = this.audioSession;
    if (!session || session.sessionId !== attachment.sessionId) {
      ws.close(1012, "Recording session restarted");
      return;
    }

    try {
      await this.onAudioMessage(session, rawMessage);
    } catch (error) {
      const source = session.activeSources[0] ?? "microphone";
      await this.failAudioSession(session, error, source);
    }
  }

  override async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    return this.runWithRoomRuntime(() =>
      this.handleMeetingWebSocketClose(ws, code, reason, wasClean));
  }

  private async handleMeetingWebSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ) {
    const attachment = readAudioAttachment(ws);
    if (!attachment) return super.webSocketClose(ws, code, reason, wasClean);

    const session = this.audioSession;
    if (session?.sessionId === attachment.sessionId) {
      if (session.socket === ws) session.socket = null;
      this.scheduleAudioDisconnect(session);
    }
  }

  override async webSocketError(ws: WebSocket, error: unknown) {
    return this.runWithRoomRuntime(() =>
      this.handleMeetingWebSocketError(ws, error));
  }

  private async handleMeetingWebSocketError(ws: WebSocket, error: unknown) {
    const attachment = readAudioAttachment(ws);
    if (!attachment) return super.webSocketError(ws, error);

    const session = this.audioSession;
    if (session?.sessionId === attachment.sessionId) {
      console.warn(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        event: "meeting_audio_client_socket_error",
        meetingId: session.claims.meetingId,
      }));
      if (session.socket === ws) session.socket = null;
    }
  }

  claimRecorder(input: {
    meetingId: string;
    recorderImage?: string | null;
    recorderName?: string;
    userId: string;
    workspaceId: string;
  }): MeetingRecorderRuntimeState {
    return this.runWithRoomRuntime(() => this.handleClaimRecorder(input));
  }

  private handleClaimRecorder(input: {
    meetingId: string;
    recorderImage?: string | null;
    recorderName?: string;
    userId: string;
    workspaceId: string;
  }): MeetingRecorderRuntimeState {
    try {
      const recorder = this.roomStorage.claimRecorder({
        expiresAt: Date.now() + RECORDER_CLAIM_TTL_MS,
        meetingId: input.meetingId,
        recorderImage: input.recorderImage ?? null,
        recorderName: input.recorderName?.trim() || "A collaborator",
        userId: input.userId,
        workspaceId: input.workspaceId,
      });
      return toRuntimeRecorder(recorder);
    } finally {
      this.scheduleMaintenanceInBackground();
    }
  }

  getRecorderState(): MeetingRecorderRuntimeState | null {
    return this.runWithRoomRuntime(() => this.handleGetRecorderState());
  }

  private handleGetRecorderState(): MeetingRecorderRuntimeState | null {
    const recorder = this.roomStorage.getRecorder();
    if (!recorder) return null;
    const recoverable = recorder.status !== "claimed" ||
      this.roomStorage.listSegments(recorder.leaseId).length > 0;
    return recorder.expiresAt > Date.now() || recoverable
      ? toRuntimeRecorder(recorder)
      : null;
  }

  releaseRecorder(input: {
    leaseId: string;
    meetingId: string;
    userId: string;
  }) {
    return this.runWithRoomRuntime(() => this.handleReleaseRecorder(input));
  }

  private handleReleaseRecorder(input: {
    leaseId: string;
    meetingId: string;
    userId: string;
  }) {
    const current = this.roomStorage.getRecorder();
    if (!current) return;
    const recorder = this.roomStorage.requireRecorder(input);
    if (this.audioSession?.recorder.leaseId === recorder.leaseId) {
      throw new Error("Stop the active recording before releasing it");
    }
    this.roomStorage.releaseRecorder(recorder);
    this.scheduleMaintenanceInBackground();
  }

  transitionRecorder(input: {
    action: "pause" | "resume" | "start" | "stop";
    durationMs?: number;
    leaseId: string;
    meetingId: string;
    userId: string;
  }): MeetingRecorderRuntimeState {
    return this.runWithRoomRuntime(() => this.handleTransitionRecorder(input));
  }

  private handleTransitionRecorder(input: {
    action: "pause" | "resume" | "start" | "stop";
    durationMs?: number;
    leaseId: string;
    meetingId: string;
    userId: string;
  }): MeetingRecorderRuntimeState {
    const recorder = this.roomStorage.requireRecorder(input);
    assertRecorderTransition(recorder.status, input.action);
    const nextStatus = input.action === "pause"
      ? "paused"
      : input.action === "stop"
        ? "finishing"
        : "recording";
    const updated = this.roomStorage.updateRecorder(recorder, {
      durationMs: input.durationMs ?? recorder.durationMs,
      expiresAt: Date.now() + (nextStatus === "paused"
        ? RECORDER_PAUSED_TTL_MS
        : RECORDER_ACTIVE_TTL_MS),
      status: nextStatus,
    });
    const session = this.audioSession;
    if (session?.recorder.leaseId === updated.leaseId) {
      session.recorder = updated;
      this.updateRecordingPresence(session, nextStatus === "finishing"
        ? "finishing"
        : nextStatus);
    }
    this.scheduleMaintenanceInBackground();
    return toRuntimeRecorder(updated);
  }

  async replaceMeetingSummary(
    content: unknown,
    meetingId: string,
    userId: string,
  ) {
    return this.runWithRoomRuntime(() =>
      this.handleReplaceMeetingSummary(content, meetingId, userId));
  }

  private async handleReplaceMeetingSummary(
    content: unknown,
    meetingId: string,
    userId: string,
  ) {
    await this.restoreConnections();
    await replaceMeetingSummaryInHocuspocus(this.hocuspocus, {
      content,
      meetingId,
      userId,
    });
  }

  async appendMeetingTranscript(
    draftItemId: string | undefined,
    meetingId: string,
    segment: MeetingTranscriptYjsSegment,
    userId: string,
  ) {
    return this.runWithRoomRuntime(() =>
      this.handleAppendMeetingTranscript(
        draftItemId,
        meetingId,
        segment,
        userId,
      ));
  }

  private async handleAppendMeetingTranscript(
    draftItemId: string | undefined,
    meetingId: string,
    segment: MeetingTranscriptYjsSegment,
    userId: string,
  ) {
    await this.restoreConnections();
    await appendMeetingTranscriptInHocuspocus(this.hocuspocus, {
      draftItemId,
      meetingId,
      segment,
      userId,
    });
  }

  private async openAudioSession(claims: MeetingAudioTicketClaims) {
    let recorder: MeetingRoomRecorder;
    try {
      recorder = this.roomStorage.requireRecorder(claims);
    } catch {
      return new Response("Recorder lease expired", { status: 409 });
    }

    const active = this.audioSession;
    if (active) {
      if (active.recorder.leaseId !== recorder.leaseId) {
        return new Response("Another recorder is active", { status: 409 });
      }
      if (active.recorder.status === "finishing") {
        return new Response("Recording is being finalized", { status: 409 });
      }
      if (active.disconnectTimer) clearTimeout(active.disconnectTimer);
      active.disconnectTimer = null;
      active.claims = claims;
      try {
        await this.finishSessionTranscribers(active);
      } catch {
        this.clearDraftTimer(active);
        this.clearLiveDraft(active);
        active.lastSequences = lastCompletedTranscriptSequences(active.segments);
      }
      active.activeSources = [];
      active.recorder = this.roomStorage.updateRecorder(recorder, {
        expiresAt: Date.now() + RECORDER_ACTIVE_TTL_MS,
        status: "recording",
      });
      this.scheduleMaintenanceInBackground();
      return this.attachAudioSocket(active);
    }

    if (recorder.status === "finishing") {
      return new Response("Recording is being finalized", { status: 409 });
    }

    await this.restoreConnections();
    const direct = await this.hocuspocus.openDirectConnection(
      documentNameForMeeting(claims.meetingId),
      {
        exp: claims.exp,
        meetingId: claims.meetingId,
        scope: "read-write",
        userId: claims.userId,
        workspaceId: claims.workspaceId,
      },
    );
    const sessionId = crypto.randomUUID();
    const segments = this.roomStorage.listSegments(recorder.leaseId);
    if (direct.document) {
      direct.document.transact(() => {
        for (const segment of segments) {
          appendMeetingTranscriptToDocument(direct.document!, {
            id: segment.id,
            source: segment.source,
            startMs: segment.startMs,
            text: segment.text,
          });
        }
      }, transientOriginForRecorder(recorder));
    }
    const session: AudioSession = {
      activeSources: [],
      claims,
      connection: direct,
      disconnectTimer: null,
      failed: false,
      lastDraftPublishedAt: { microphone: 0, system: 0 },
      lastLeaseRefreshAt: Date.now(),
      lastSequences: lastCompletedTranscriptSequences(segments),
      latestDrafts: {},
      publishTimers: {},
      providerGenerations: { microphone: 0, system: 0 },
      readySources: new Set(),
      recorder: this.roomStorage.updateRecorder(recorder, {
        expiresAt: Date.now() + RECORDER_ACTIVE_TTL_MS,
        status: "recording",
      }),
      segments,
      sessionId,
      socket: null,
      transcribers: new Map(),
    };
    this.audioSession = session;
    this.scheduleMaintenanceInBackground();
    this.updateRecordingPresence(session, "recording");
    return this.attachAudioSocket(session);
  }

  private attachAudioSocket(session: AudioSession) {
    if (session.socket?.readyState === WebSocket.OPEN) {
      session.socket.close(1008, "Recorder reconnected");
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    session.socket = server;
    server.binaryType = "arraybuffer";
    server.serializeAttachment({
      claims: session.claims,
      kind: "meeting-audio",
      sessionId: session.sessionId,
    });
    this.ctx.acceptWebSocket(server);
    return new Response(null, {
      headers: { "Sec-WebSocket-Protocol": MEETING_AUDIO_PROTOCOL },
      status: 101,
      webSocket: client,
    });
  }

  private async createSessionTranscribers(session: AudioSession) {
    session.readySources.clear();
    await Promise.all(session.activeSources.map(async (source) => {
      const transcriber = await this.createSourceTranscriber(session, source);
      session.transcribers.set(source, transcriber);
    }));
  }

  private createSourceTranscriber(
    session: AudioSession,
    source: MeetingAudioSource,
  ) {
    const generation = ++session.providerGenerations[source];
    const isCurrent = () => session.providerGenerations[source] === generation;
    const publicTurn = (turn: RealtimeTranscriptionTurn) => ({
      ...turn,
      itemId: `${source}:${turn.itemId}`,
    });
    return this.connectRealtimeTranscriber(
      (turn) => {
        if (!isCurrent()) return;
        const published = publicTurn(turn);
        this.sendAudioEvent(session, {
          itemId: published.itemId,
          source,
          startMs: turn.startSequence * 20,
          text: published.text,
          type: "transcript.delta",
          updatedAt: Date.now(),
        });
        this.queueDraft(session, source, published);
      },
      (turn) => {
        if (isCurrent()) this.completeTurn(session, source, publicTurn(turn));
      },
      (error) => {
        if (isCurrent()) {
          this.ctx.waitUntil(this.failAudioSession(session, error, source, generation));
        }
      },
      () => {
        if (!isCurrent()) return;
        session.readySources.add(source);
        this.announceReady(session);
      },
      session.claims.userId,
    );
  }

  private async connectRealtimeTranscriber(
    onDelta: (turn: RealtimeTranscriptionTurn) => void,
    onCompleted: (turn: RealtimeTranscriptionTurn) => void,
    onError: (error: Error) => void,
    onReady: () => void,
    userId: string,
  ) {
    const { apiKey, model } = getMeetingRealtimeTranscriptionConfig(this.env);
    const safetyIdentifier = await getMeetingOpenAiSafetyIdentifier(userId);
    const handshake = new AbortController();
    const handshakeTimer = setTimeout(
      () => handshake.abort(new Error("Realtime transcription handshake timed out")),
      15_000,
    );
    let response: Response;
    try {
      response = await fetch(getMeetingRealtimeTranscriptionUrl("https"), {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "OpenAI-Safety-Identifier": safetyIdentifier,
          Upgrade: "websocket",
        },
        signal: handshake.signal,
      });
    } finally {
      clearTimeout(handshakeTimer);
    }
    const socket = response.webSocket;
    if (response.status !== 101 || !socket) {
      await response.body?.cancel();
      throw new Error(`Realtime transcription provider returned ${response.status}`);
    }
    socket.accept();
    return new MeetingRealtimeTranscriber(
      socket as unknown as RealtimeTranscriptionSocket,
      model,
      { onCompleted, onDelta, onError, onReady },
    );
  }

  private async onAudioMessage(session: AudioSession, raw: unknown) {
    if (session.failed) return;
    if (typeof raw === "string") {
      await this.onAudioControlMessage(session, raw);
      return;
    }
    if (session.recorder.status !== "recording") return;
    const frame = await meetingAudioMessageBytes(raw);
    if (
      !frame ||
      frame.byteLength < AUDIO_PACKET_HEADER_BYTES + PCM_FRAME_BYTES ||
      frame.byteLength > MAX_FRAME_BYTES
    ) {
      session.socket?.close(1003, "Binary PCM16 audio frames are required");
      return;
    }
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const sequenceValue = view.getBigUint64(0, true);
    if (sequenceValue > BigInt(Number.MAX_SAFE_INTEGER)) {
      session.socket?.close(1008, "Invalid meeting audio sequence");
      return;
    }
    const sequence = Number(sequenceValue);
    const source = meetingAudioSourceFromCode(frame[8]);
    if (!source || !session.activeSources.includes(source)) {
      session.socket?.close(1008, "Invalid meeting audio source");
      return;
    }
    const transcriber = session.transcribers.get(source);
    if (!transcriber) return;
    const pcm = frame.slice(AUDIO_PACKET_HEADER_BYTES);
    if (pcm.byteLength % PCM_FRAME_BYTES !== 0) {
      session.socket?.close(1003, "PCM16 audio frames are required");
      return;
    }
    const accepted = trimAcceptedMeetingAudio(
      pcm,
      sequence,
      session.lastSequences[source],
    );
    if (!accepted) return;
    session.lastSequences[source] = accepted.endSequence;
    transcriber.appendAudio(accepted.pcm, accepted.sequence);

    if (
      Date.now() - session.lastLeaseRefreshAt >= RECORDER_ACTIVE_TTL_MS / 2
    ) {
      session.lastLeaseRefreshAt = Date.now();
      session.recorder = this.roomStorage.updateRecorder(session.recorder, {
        expiresAt: Date.now() + RECORDER_ACTIVE_TTL_MS,
        status: "recording",
      });
      this.scheduleMaintenanceInBackground();
    }
    if (session.claims.exp - Date.now() <= AUDIO_TICKET_REFRESH_LEAD_MS) {
      await this.refreshAudioTicket(session);
    }
  }

  private async onAudioControlMessage(session: AudioSession, raw: string) {
    let message: { durationMs?: unknown; sources?: unknown; type?: unknown };
    try {
      message = JSON.parse(raw) as {
        durationMs?: unknown;
        sources?: unknown;
        type?: unknown;
      };
    } catch {
      session.socket?.close(1003, "Invalid meeting audio control message");
      return;
    }

    if (message.type === "recording.configure") {
      const sources = parseMeetingAudioSources(message.sources);
      if (!sources || session.activeSources.length > 0) {
        session.socket?.close(1008, "Invalid meeting audio sources");
        return;
      }
      session.activeSources = sources;
      await this.createSessionTranscribers(session);
      return;
    }

    if (message.type === "recording.pause") {
      if (session.recorder.status !== "recording") return;
      await this.finishSessionTranscribers(session);
      session.recorder = this.roomStorage.updateRecorder(session.recorder, {
        expiresAt: Date.now() + RECORDER_PAUSED_TTL_MS,
        status: "paused",
      });
      this.scheduleMaintenanceInBackground();
      await this.refreshAudioTicket(session);
      this.updateRecordingPresence(session, "paused");
      this.sendAudioEvent(session, { type: "recording.paused" });
      return;
    }

    if (message.type === "recording.resume") {
      if (session.recorder.status !== "paused") return;
      session.recorder = this.roomStorage.updateRecorder(session.recorder, {
        expiresAt: Date.now() + RECORDER_ACTIVE_TTL_MS,
        status: "recording",
      });
      this.scheduleMaintenanceInBackground();
      if (session.claims.exp - Date.now() <= AUDIO_TICKET_REFRESH_LEAD_MS) {
        await this.refreshAudioTicket(session);
      }
      await this.createSessionTranscribers(session);
      this.updateRecordingPresence(session, "recording");
      return;
    }

    if (message.type === "recording.stop") {
      const durationMs = typeof message.durationMs === "number" &&
          Number.isFinite(message.durationMs)
        ? Math.max(0, Math.min(10_800_000, Math.round(message.durationMs)))
        : Math.max(session.recorder.durationMs, audioSessionDurationMs(session));
      await this.finishAudioSession(session, { durationMs, notify: true });
      return;
    }

    session.socket?.close(1003, "Unknown meeting audio control message");
  }

  private async refreshAudioTicket(session: AudioSession) {
    const ticket = await createMeetingAudioTicket(
      {
        leaseId: session.recorder.leaseId,
        meetingId: session.recorder.meetingId,
        recorderImage: session.recorder.recorderImage,
        recorderName: session.recorder.recorderName,
        userId: session.recorder.userId,
        workspaceId: session.recorder.workspaceId,
      },
      this.env,
    );
    session.claims = { ...session.claims, exp: new Date(ticket.expiresAt).getTime() };
    if (session.socket) {
      session.socket.serializeAttachment({
        claims: session.claims,
        kind: "meeting-audio",
        sessionId: session.sessionId,
      } satisfies AudioSocketAttachment);
    }
    this.sendAudioEvent(session, {
      expiresAt: ticket.expiresAt,
      token: ticket.token,
      type: "recording.ticket",
    });
  }

  private queueDraft(
    session: AudioSession,
    source: MeetingAudioSource,
    turn: RealtimeTranscriptionTurn,
  ) {
    if (!turn.text.trim()) return;
    session.latestDrafts[source] = turn;
    if (session.publishTimers[source]) return;
    const delay = Math.max(
      0,
      DRAFT_PUBLISH_INTERVAL_MS - (Date.now() - session.lastDraftPublishedAt[source]),
    );
    session.publishTimers[source] = setTimeout(() => {
      delete session.publishTimers[source];
      const draft = session.latestDrafts[source];
      delete session.latestDrafts[source];
      if (!draft || this.audioSession?.sessionId !== session.sessionId) return;
      session.lastDraftPublishedAt[source] = Date.now();
      this.updateLiveDraft(session, source, draft);
    }, delay);
  }

  private completeTurn(
    session: AudioSession,
    source: MeetingAudioSource,
    turn: RealtimeTranscriptionTurn,
  ) {
    this.clearDraftTimer(session, source);
    const text = turn.text.trim();
    if (!text) {
      this.sendCompletedTurn(session, source, turn);
      this.clearLiveDraft(session, source, turn.itemId);
      return;
    }
    const segment: MeetingTranscriptSessionSegment = {
      endMs: (turn.endSequence + 1) * 20,
      id: crypto.randomUUID(),
      providerItemId: `${session.claims.leaseId}:${turn.itemId}`,
      sequence: meetingTranscriptSequence(source, turn.startSequence),
      source,
      startMs: turn.startSequence * 20,
      text,
    };
    const document = session.connection.document;
    const checkpoint = this.roomStorage.checkpoint(
      session.recorder,
      segment,
      {
        durationMs: Math.max(session.recorder.durationMs, segment.endMs),
        expiresAt: Date.now() + RECORDER_ACTIVE_TTL_MS,
      },
    );
    session.recorder = checkpoint.recorder;
    if (!checkpoint.inserted) {
      this.sendCompletedTurn(session, source, turn);
      this.clearLiveDraft(session, source, turn.itemId);
      return;
    }
    session.segments.push(segment);
    if (!document) {
      throw new Error("Meeting transcript document is unavailable");
    }
    document.transact(() => {
      appendMeetingTranscriptToDocument(
        document,
        {
          id: segment.id,
          source,
          startMs: segment.startMs,
          text: segment.text,
        },
        turn.itemId,
      );
    }, transientOrigin(session));
    this.sendCompletedTurn(session, source, turn);
    this.scheduleMaintenanceInBackground();
  }

  private sendCompletedTurn(
    session: AudioSession,
    source: MeetingAudioSource,
    turn: RealtimeTranscriptionTurn,
  ) {
    this.sendAudioEvent(session, {
      itemId: turn.itemId,
      source,
      startMs: turn.startSequence * 20,
      text: "",
      type: "transcript.delta",
      updatedAt: Date.now(),
    });
  }

  private updateLiveDraft(
    session: AudioSession,
    source: MeetingAudioSource,
    turn: RealtimeTranscriptionTurn,
  ) {
    const document = session.connection.document;
    if (!document) return;
    document.transact(() => {
      const draft = document.getMap<string | number>(`liveTranscript:${source}`);
      draft.clear();
      draft.set("itemId", turn.itemId);
      draft.set("startMs", turn.startSequence * 20);
      draft.set("text", turn.text);
      draft.set("updatedAt", Date.now());
    }, transientOrigin(session));
  }

  private clearLiveDraft(
    session: AudioSession,
    source?: MeetingAudioSource,
    itemId?: string,
  ) {
    const document = session.connection.document;
    if (!document) return;
    document.transact(() => {
      const sources = source ? [source] : MEETING_AUDIO_SOURCES;
      for (const currentSource of sources) {
        const draft = document.getMap<string | number>(
          `liveTranscript:${currentSource}`,
        );
        if (!itemId || draft.get("itemId") === itemId) draft.clear();
      }
    }, transientOrigin(session));
  }

  private updateRecordingPresence(
    session: AudioSession,
    status: "recording" | "paused" | "finishing",
  ) {
    const document = session.connection.document;
    if (!document) return;
    document.transact(() => {
      const presence = document.getMap<string | number>("recordingPresence");
      presence.clear();
      presence.set("recorderId", session.claims.userId);
      presence.set("recorderName", session.claims.recorderName || "A collaborator");
      if (session.claims.recorderImage) {
        presence.set("recorderImage", session.claims.recorderImage);
      }
      presence.set("startedAt", session.recorder.startedAt);
      presence.set("status", status);
    }, transientOrigin(session));
  }

  private announceReady(session: AudioSession) {
    if (
      session.socket?.readyState !== WebSocket.OPEN ||
      session.activeSources.length === 0 ||
      session.activeSources.some((source) => !session.readySources.has(source))
    ) return;
    this.sendAudioEvent(session, {
      leaseId: session.claims.leaseId,
      meetingId: session.claims.meetingId,
      nextSequences: Object.fromEntries(session.activeSources.map((source) => [
        source,
        session.lastSequences[source] + 1,
      ])),
      type: "meeting.ready",
    });
  }

  private sendAudioEvent(session: AudioSession, event: Record<string, unknown>) {
    if (session.socket?.readyState === WebSocket.OPEN) {
      session.socket.send(JSON.stringify(event));
    }
  }

  private scheduleAudioDisconnect(session: AudioSession) {
    if (session.disconnectTimer) return;
    session.disconnectTimer = setTimeout(() => {
      session.disconnectTimer = null;
      if (this.audioSession?.sessionId !== session.sessionId || session.socket) return;
      this.ctx.waitUntil(this.finishAudioSession(session, {
        durationMs: Math.max(
          session.recorder.durationMs,
          audioSessionDurationMs(session),
        ),
      }));
    }, RECORDER_RECONNECT_GRACE_MS);
  }

  private async finishAudioSession(
    session: AudioSession,
    options: { durationMs: number; notify?: boolean },
  ) {
    if (this.audioSession?.sessionId !== session.sessionId) return;
    this.audioSession = null;
    if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
    session.disconnectTimer = null;
    this.clearDraftTimer(session);
    session.recorder = this.roomStorage.updateRecorder(session.recorder, {
      durationMs: options.durationMs,
      expiresAt: Date.now() + RECORDER_ACTIVE_TTL_MS,
      status: "finishing",
      stoppedAt: session.recorder.stoppedAt ?? Date.now(),
    });
    this.scheduleMaintenanceInBackground();
    this.updateRecordingPresence(session, "finishing");

    try {
      if (!session.failed) await this.finishSessionTranscribers(session);
      this.clearLiveDraft(session);
      const document = session.connection.document;
      if (!document) return;
      document.transact(() => {
        document.getMap("recordingPresence").clear();
      }, transientOrigin(session));
      const finalState = Y.encodeStateAsUpdate(document);
      await runWithDbEnv(this.env, () => persistMeetingTranscriptSession({
        finalize: {
          durationMs: options.durationMs,
          startedAt: session.recorder.startedAt,
          stoppedAt: session.recorder.stoppedAt ?? Date.now(),
        },
        meetingId: session.claims.meetingId,
        segments: session.segments,
        yjsState: finalState,
      }));
      const latestState = Y.encodeStateAsUpdate(document);
      await this.persistConcurrentDocumentUpdate(
        session.claims.meetingId,
        finalState,
        latestState,
      );
      const documentName = documentNameForMeeting(session.claims.meetingId);
      const completionState = mergeMeetingDocumentStates(
        latestState,
        this.roomStorage.loadDocumentSync(documentName),
      );
      this.roomStorage.completeSession(
        documentName,
        session.claims.meetingId,
        completionState,
      );
      this.scheduleMaintenanceInBackground();
      if (options.notify) {
        this.sendAudioEvent(session, {
          durationMs: options.durationMs,
          segmentCount: session.segments.length,
          type: "recording.flush.completed",
        });
      }
      session.socket?.close(1000, "Meeting transcript persisted");
    } catch (error) {
      console.error(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        event: "meeting_audio_transcription_finalize_error",
        meetingId: session.claims.meetingId,
      }));
      if (options.notify) {
        this.sendAudioEvent(session, {
          message: "Could not persist the completed transcript",
          type: "recording.error",
        });
      }
      session.socket?.close(1011, "Meeting transcript persistence failed");
      this.scheduleMaintenanceInBackground();
    } finally {
      this.releaseDirectConnectionInBackground(
        session.connection,
        session.claims.meetingId,
      );
    }
  }

  private async failAudioSession(
    session: AudioSession,
    error: unknown,
    source: MeetingAudioSource,
    generation = session.providerGenerations[source],
  ) {
    if (
      session.failed ||
      this.audioSession?.sessionId !== session.sessionId ||
      session.providerGenerations[source] !== generation
    ) return;
    const closeCode = getMeetingTranscriptionFailureCloseCode(error);
    const retryable = closeCode !== MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE;
    this.abortSessionTranscribers(session);
    console.error(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      event: "meeting_audio_transcription_error",
      meetingId: session.claims.meetingId,
      retryable,
    }));
    if (retryable) {
      this.clearDraftTimer(session);
      this.clearLiveDraft(session);
      session.lastSequences = lastCompletedTranscriptSequences(session.segments);
    } else {
      session.failed = true;
    }
    if (session.socket?.readyState === WebSocket.OPEN) {
      try {
        session.socket.close(
          closeCode,
          "Meeting transcription failed",
        );
      } catch {
        // The recorder may already have disconnected.
      }
    }
    if (retryable) return;
    await this.finishAudioSession(session, {
      durationMs: Math.max(
        session.recorder.durationMs,
        audioSessionDurationMs(session),
      ),
    });
  }

  private async finishSessionTranscribers(session: AudioSession) {
    const transcribers = [...session.transcribers.values()];
    session.transcribers.clear();
    session.readySources.clear();
    const results = await Promise.allSettled(
      transcribers.map((transcriber) => transcriber.finish()),
    );
    for (const source of MEETING_AUDIO_SOURCES) {
      session.providerGenerations[source] += 1;
    }
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
  }

  private abortSessionTranscribers(session: AudioSession) {
    for (const transcriber of session.transcribers.values()) transcriber.abort();
    session.transcribers.clear();
    session.readySources.clear();
    for (const source of MEETING_AUDIO_SOURCES) {
      session.providerGenerations[source] += 1;
    }
  }

  private async finalizeStoredRecorder(recorder: MeetingRoomRecorder) {
    if (
      recorder.status === "claimed" &&
      this.roomStorage.listSegments(recorder.leaseId).length === 0
    ) {
      this.roomStorage.releaseRecorder(recorder);
      return;
    }

    if (!recorder.stoppedAt || recorder.status !== "finishing") {
      recorder = this.roomStorage.updateRecorder(recorder, {
        status: "finishing",
        stoppedAt: recorder.stoppedAt ?? Date.now(),
      });
    }

    const documentName = documentNameForMeeting(recorder.meetingId);
    const document = new Y.Doc();
    try {
      const storedState = await this.roomStorage.loadDocument(documentName);
      if (storedState.byteLength > 0) Y.applyUpdate(document, storedState);
      const segments = this.roomStorage.listSegments(recorder.leaseId);
      applyRecoveredMeetingSegments(document, segments);
      const finalState = Y.encodeStateAsUpdate(document);
      await runWithDbEnv(this.env, () => persistMeetingTranscriptSession({
        finalize: {
          durationMs: recorder.durationMs,
          startedAt: recorder.startedAt,
          stoppedAt: recorder.stoppedAt!,
        },
        meetingId: recorder.meetingId,
        segments,
        yjsState: finalState,
      }));
      const latestState = buildRecoveredMeetingState(
        this.roomStorage.loadDocumentSync(documentName),
        segments,
      );
      await this.persistConcurrentDocumentUpdate(
        recorder.meetingId,
        finalState,
        latestState,
      );
      const completionState = mergeMeetingDocumentStates(
        latestState,
        this.roomStorage.loadDocumentSync(documentName),
      );
      this.roomStorage.completeSession(
        documentName,
        recorder.meetingId,
        completionState,
      );
    } catch (error) {
      this.roomStorage.updateRecorder(recorder, {
        expiresAt: Date.now() + 30_000,
        status: "finishing",
      });
      console.error(JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        event: "meeting_recording_recovery_failed",
        meetingId: recorder.meetingId,
      }));
    } finally {
      document.destroy();
    }
  }

  private clearDraftTimer(session: AudioSession, source?: MeetingAudioSource) {
    const sources = source ? [source] : MEETING_AUDIO_SOURCES;
    for (const currentSource of sources) {
      const timer = session.publishTimers[currentSource];
      if (timer) clearTimeout(timer);
      delete session.publishTimers[currentSource];
      delete session.latestDrafts[currentSource];
    }
  }

  private async persistConcurrentDocumentUpdate(
    meetingId: string,
    persistedState: Uint8Array,
    latestState: Uint8Array,
  ) {
    if (uint8ArraysEqual(persistedState, latestState)) return;
    await runWithDbEnv(this.env, () => persistMeetingTranscriptSession({
      meetingId,
      segments: [],
      yjsState: latestState,
    }));
  }

  private releaseDirectConnectionInBackground(
    connection: TranscriptDirectConnection,
    meetingId: string,
  ) {
    this.ctx.waitUntil(
      releaseDirectConnection(this.hocuspocus, connection).catch((error) => {
        console.error(JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          event: "meeting_direct_connection_release_failed",
          meetingId,
        }));
      }),
    );
  }
}

function documentSyncRetryDelay(previousAttempts: number) {
  return Math.min(
    DOCUMENT_SYNC_MAX_RETRY_MS,
    DOCUMENT_SYNC_RETRY_MS * 2 ** Math.min(previousAttempts, 4),
  );
}

function transientOrigin(session: AudioSession) {
  return {
    context: {
      meetingId: session.claims.meetingId,
      userId: session.claims.userId,
    },
    skipStoreHooks: true,
    source: "local",
  } as const;
}

function transientOriginForRecorder(recorder: MeetingRoomRecorder) {
  return {
    context: {
      meetingId: recorder.meetingId,
      userId: recorder.userId,
    },
    skipStoreHooks: true,
    source: "local",
  } as const;
}

async function loadMeetingRoomDocument(
  storage: MeetingRoomStorage,
  documentName: string,
  env: PageCollaborationEnv,
) {
  let baseState: Uint8Array;
  if (storage.hasDocument(documentName)) {
    baseState = await storage.loadDocument(documentName);
  } else {
    baseState = await runWithDbEnv(env, () =>
      getOrCreateMeetingCollaborationDocumentState(
        meetingIdFromDocumentName(documentName) ?? "",
      )
    );
    storage.storeDocument(documentName, baseState);
  }

  const recorder = storage.getRecorder();
  if (!recorder) return baseState;
  const segments = storage.listSegments(recorder.leaseId);
  if (segments.length === 0) return baseState;

  const document = new Y.Doc();
  try {
    if (baseState.byteLength > 0) Y.applyUpdate(document, baseState);
    for (const segment of segments) {
      appendMeetingTranscriptToDocument(document, {
        id: segment.id,
        source: segment.source,
        startMs: segment.startMs,
        text: segment.text,
      });
    }
    return Y.encodeStateAsUpdate(document);
  } finally {
    document.destroy();
  }
}

function buildRecoveredMeetingState(
  baseState: Uint8Array,
  segments: MeetingTranscriptSessionSegment[],
) {
  const document = new Y.Doc();
  try {
    if (baseState.byteLength > 0) Y.applyUpdate(document, baseState);
    applyRecoveredMeetingSegments(document, segments);
    return Y.encodeStateAsUpdate(document);
  } finally {
    document.destroy();
  }
}

function applyRecoveredMeetingSegments(
  document: Y.Doc,
  segments: MeetingTranscriptSessionSegment[],
) {
  document.transact(() => {
    for (const segment of segments) {
      appendMeetingTranscriptToDocument(document, {
        id: segment.id,
        source: segment.source,
        startMs: segment.startMs,
        text: segment.text,
      });
    }
    document.getMap("liveTranscript:microphone").clear();
    document.getMap("liveTranscript:system").clear();
    document.getMap("recordingPresence").clear();
  }, "meeting-recovery");
}

function mergeMeetingDocumentStates(...states: Uint8Array[]) {
  const document = new Y.Doc();
  try {
    for (const state of states) {
      if (state.byteLength > 0) Y.applyUpdate(document, state);
    }
    return Y.encodeStateAsUpdate(document);
  } finally {
    document.destroy();
  }
}

function uint8ArraysEqual(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function lastCompletedTranscriptSequences(
  segments: MeetingTranscriptSessionSegment[],
) {
  const result: Record<MeetingAudioSource, number> = {
    microphone: -1,
    system: -1,
  };
  for (const segment of segments) {
    const sequence = Math.ceil(segment.endMs / 20) - 1;
    result[segment.source] = Math.max(result[segment.source], sequence);
  }
  return result;
}

function audioSessionDurationMs(session: AudioSession) {
  return Math.max(
    0,
    ...session.activeSources.map((source) =>
      (session.lastSequences[source] + 1) * 20
    ),
  );
}

function parseMeetingAudioSources(value: unknown): MeetingAudioSource[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const sources = [...new Set(value)];
  return sources.length === value.length && sources.every((source) =>
      MEETING_AUDIO_SOURCES.includes(source as MeetingAudioSource)
    )
    ? sources as MeetingAudioSource[]
    : null;
}

function readAudioAttachment(ws: WebSocket): AudioSocketAttachment | null {
  const attachment = ws.deserializeAttachment();
  return attachment &&
      typeof attachment === "object" &&
      (attachment as { kind?: unknown }).kind === "meeting-audio" &&
      typeof (attachment as { sessionId?: unknown }).sessionId === "string"
    ? attachment as AudioSocketAttachment
    : null;
}

async function releaseDirectConnection(
  hocuspocus: { unloadDocument(document: Y.Doc): Promise<unknown> },
  connection: TranscriptDirectConnection,
) {
  const document = connection.document as (Y.Doc & {
    removeDirectConnection?: () => void;
  }) | null;
  if (!document) return;
  document.removeDirectConnection?.();
  connection.document = null;
  await hocuspocus.unloadDocument(document);
}

function toRuntimeRecorder(
  recorder: MeetingRoomRecorder,
): MeetingRecorderRuntimeState {
  return {
    durationMs: recorder.durationMs,
    expiresAt: recorder.expiresAt,
    leaseId: recorder.leaseId,
    recorderId: recorder.userId,
    recorderImage: recorder.recorderImage,
    recorderName: recorder.recorderName,
    startedAt: recorder.startedAt,
    status: recorder.status,
  };
}

function assertRecorderTransition(
  status: MeetingRoomRecorder["status"],
  action: "pause" | "resume" | "start" | "stop",
) {
  const allowed = action === "start"
    ? status === "claimed" || status === "recording"
    : action === "pause"
      ? status === "recording" || status === "paused"
      : action === "resume"
        ? status === "paused" || status === "recording"
        : status === "recording" || status === "paused" || status === "finishing";
  if (!allowed) {
    throw new Error(`Cannot ${action} a ${status} recorder session`);
  }
}

function meetingTranscriptWriteGuard(
  storage: MeetingRoomStorage,
): Extension {
  return {
    async beforeSync({ document, payload, type }) {
      // SyncStep1 is only a state-vector request. SyncStep2 and Update carry
      // mutations that must not touch generated transcript state while a
      // recorder lease exists. Notes and summary remain collaborative.
      if (type === 0 || !storage.getRecorder()) return;

      const candidate = new Y.Doc();
      try {
        Y.applyUpdate(candidate, Y.encodeStateAsUpdate(document));
        let transcriptChanged = false;
        const changed = () => {
          transcriptChanged = true;
        };
        const transcript = candidate.getXmlFragment("transcript");
        const segmentIds = candidate.getMap("transcriptSegmentIds");
        transcript.observeDeep(changed);
        segmentIds.observeDeep(changed);
        Y.applyUpdate(candidate, payload);
        transcript.unobserveDeep(changed);
        segmentIds.unobserveDeep(changed);
        if (transcriptChanged) {
          throw Object.assign(
            new Error("Transcript is read-only while recording"),
            { code: 1008, reason: "Transcript is read-only while recording" },
          );
        }
      } finally {
        candidate.destroy();
      }
    },
  };
}
