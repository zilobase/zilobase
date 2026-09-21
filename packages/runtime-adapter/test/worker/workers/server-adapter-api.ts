import { getRuntimePorts } from "../../../src/context";

function pageIdFromDocumentName(documentName: string) {
  return documentName.startsWith("page:") ? documentName.slice(5) : null;
}

function meetingIdFromDocumentName(documentName: string) {
  return documentName.startsWith("meeting:") ? documentName.slice(8) : null;
}

function createCollaborationHocuspocus() {
  const hocuspocus = {
    configuration: { extensions: [] as unknown[] },
    documents: new Map<string, {
      getConnectionsCount(): number;
      name: string;
    }>(),
    handledConnections: 0,
    pageReplacementCalls: 0,
    runtimePortChecks: 0,
    summaryReplacementCalls: 0,
    storeDocumentCalls: 0,
    transcriptAppendCalls: 0,
    async storeDocumentHooks() {
      hocuspocus.storeDocumentCalls += 1;
    },
    async unloadDocument() {},
    handleConnection(_socket: WebSocket, request: Request, context: unknown) {
      hocuspocus.handledConnections += 1;
      const documentName = new URL(request.url).searchParams.get("document") ?? "";
      if (documentName && !hocuspocus.documents.has(documentName)) {
        hocuspocus.documents.set(documentName, {
          getConnectionsCount: () => 1,
          name: documentName,
        });
      }
      return {
        handleClose() {},
        handleMessage() {
          getRuntimePorts();
          hocuspocus.runtimePortChecks += 1;
          for (const extension of hocuspocus.configuration.extensions) {
            const connected = (extension as {
              connected?: (input: { context: unknown }) => Promise<void> | void;
            }).connected;
            if (connected) void connected({ context });
            const afterHandleMessage = (extension as {
              afterHandleMessage?: (input: { context: unknown }) => Promise<void> | void;
            }).afterHandleMessage;
            if (afterHandleMessage) void afterHandleMessage({ context });
          }
        },
        pingInterval: setInterval(() => undefined, 60_000),
      };
    },
  };
  return hocuspocus;
}

async function replacePageContentInHocuspocus(hocuspocus: ReturnType<
  typeof createCollaborationHocuspocus
>) {
  hocuspocus.pageReplacementCalls += 1;
}

async function appendMeetingTranscriptInHocuspocus(hocuspocus: ReturnType<
  typeof createCollaborationHocuspocus
>) {
  hocuspocus.transcriptAppendCalls += 1;
}

function createMeetingRealtimeTranscriptSink() {
  return { onCompleted() {}, onDelta() {} };
}

function appendMeetingTranscriptToDocument() {
  return true;
}

function documentNameForMeeting(meetingId: string) {
  return `meeting:${meetingId}`;
}

async function getOrCreateMeetingCollaborationDocumentState() {
  return new Uint8Array();
}

async function createMeetingAudioTicket() {
  return {
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    token: "test-audio-ticket",
  };
}

function getMeetingRealtimeTranscriptionConfig() {
  return { apiKey: "test-key", model: "gpt-live-transcribe" };
}

async function getMeetingOpenAiSafetyIdentifier() {
  return "test-safety-identifier";
}

function trimAcceptedMeetingAudio(
  pcm: Uint8Array,
  sequence: number,
  lastAcceptedSequence: number,
) {
  const frameBytes = 480 * 2;
  const frameCount = pcm.byteLength / frameBytes;
  const endSequence = sequence + frameCount - 1;
  if (endSequence <= lastAcceptedSequence) return null;
  const skippedFrames = Math.max(0, lastAcceptedSequence - sequence + 1);
  return {
    endSequence,
    pcm: pcm.subarray(skippedFrames * frameBytes),
    sequence: sequence + skippedFrames,
  };
}

function getMeetingRealtimeTranscriptionUrl(protocol: "https" | "wss") {
  return `${protocol}://api.openai.test/v1/realtime?intent=transcription`;
}

function getMeetingTranscriptionFailureCloseCode() {
  return 1011;
}

const MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE = 4400;

async function persistMeetingTranscriptSession() {}

async function runWithDbEnv(_env: unknown, run: () => unknown) {
  return run();
}

function createDbClient() {
  const db = {};
  return { client: {}, db, lifecycle: "standalone" as const };
}

async function runWithDbClient(
  databaseClient: ReturnType<typeof createDbClient>,
  run: () => unknown,
) {
  void databaseClient;
  return run();
}

async function getMembership() {
  return null;
}

class MembershipService {
  async grantMembership() {
    return { created: true, membership: {} };
  }
}

async function validateMeetingRecorderLease() {}

class MeetingRealtimeTranscriber {
  constructor(..._args: unknown[]) {}
  abort() {}
  appendAudio() {}
  async finish() {}
}

async function replaceMeetingSummaryInHocuspocus(hocuspocus: ReturnType<
  typeof createCollaborationHocuspocus
>) {
  hocuspocus.summaryReplacementCalls += 1;
}

export type MeetingTranscriptYjsSegment = {
  id: string;
  source: "microphone" | "system";
  startMs: number;
  text: string;
};

export type MeetingTranscriptSessionSegment = {
  endMs: number;
  id: string;
  providerItemId: string;
  sequence: number;
  source: "microphone" | "system";
  startMs: number;
  text: string;
};

export type RealtimeTranscriptionTurn = {
  endSequence: number;
  itemId: string;
  startSequence: number;
  text: string;
};

export type RealtimeTranscriptionSocket = WebSocket;

export {
  appendMeetingTranscriptInHocuspocus,
  appendMeetingTranscriptToDocument,
  createCollaborationHocuspocus,
  createDbClient,
  createMeetingAudioTicket,
  createMeetingRealtimeTranscriptSink,
  documentNameForMeeting,
  getMeetingOpenAiSafetyIdentifier,
  getMembership,
  getMeetingRealtimeTranscriptionConfig,
  getMeetingRealtimeTranscriptionUrl,
  getMeetingTranscriptionFailureCloseCode,
  getOrCreateMeetingCollaborationDocumentState,
  MEETING_RECORDER_LEASE_HEARTBEAT_MS,
  MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE,
  MembershipService,
  meetingIdFromDocumentName,
  MeetingRealtimeTranscriber,
  pageIdFromDocumentName,
  persistMeetingTranscriptSession,
  replaceMeetingSummaryInHocuspocus,
  replacePageContentInHocuspocus,
  runWithDbEnv,
  runWithDbClient,
  trimAcceptedMeetingAudio,
  validateMeetingRecorderLease,
};

const MEETING_RECORDER_LEASE_HEARTBEAT_MS = 60_000;
