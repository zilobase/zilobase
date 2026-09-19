import type {
  CollaborationDocumentPersistence,
  MeetingTranscriptSessionSegment,
} from "@zilobase/server/adapter-api";

export type MeetingRoomRecorderStatus =
  | "claimed"
  | "finishing"
  | "paused"
  | "recording";

export type MeetingRoomRecorder = {
  durationMs: number;
  expiresAt: number;
  leaseId: string;
  meetingId: string;
  recorderImage: string | null;
  recorderName: string;
  startedAt: number;
  status: MeetingRoomRecorderStatus;
  stoppedAt: number | null;
  updatedAt: number;
  userId: string;
  workspaceId: string;
};

type RecorderCheckpointPatch = Partial<
  Pick<
    MeetingRoomRecorder,
    "durationMs" | "expiresAt" | "status" | "stoppedAt"
  >
>;

type RecorderRow = {
  duration_ms: number;
  expires_at: number;
  lease_id: string;
  meeting_id: string;
  recorder_image: string | null;
  recorder_name: string;
  started_at: number;
  status: MeetingRoomRecorderStatus;
  stopped_at: number | null;
  updated_at: number;
  user_id: string;
  workspace_id: string;
};

type SegmentRow = {
  end_ms: number;
  id: string;
  provider_item_id: string;
  sequence: number;
  source: "microphone" | "system";
  start_ms: number;
  text: string;
};

type DocumentSyncRow = {
  attempts: number;
  meeting_id: string;
  next_attempt_at: number;
  state: ArrayBuffer;
  updated_at: number;
};

export type MeetingRoomDocumentSync = {
  attempts: number;
  meetingId: string;
  nextAttemptAt: number;
  state: Uint8Array;
  updatedAt: number;
};

const SCHEMA_VERSION = 6;

export class MeetingRoomStorage {
  readonly persistence: CollaborationDocumentPersistence;

  constructor(private readonly storage: DurableObjectStorage) {
    this.persistence = {
      load: (documentName) => this.loadDocument(documentName),
      store: ({ documentName, state }) => {
        this.storeDocument(documentName, state);
        return Promise.resolve();
      },
    };
  }

  migrate() {
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);
    const version = this.storage.sql
      .exec<{ version: number }>(
        "SELECT COALESCE(MAX(id), 0) AS version FROM _sql_schema_migrations",
      )
      .one().version;
    if (version < 1) this.storage.transactionSync(() => {
      this.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS meeting_document (
          document_name TEXT PRIMARY KEY,
          state BLOB NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS recorder_session (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          meeting_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          lease_id TEXT NOT NULL,
          recorder_name TEXT NOT NULL,
          recorder_image TEXT,
          status TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          stopped_at INTEGER,
          duration_ms INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS transcript_checkpoint (
          lease_id TEXT NOT NULL,
          id TEXT PRIMARY KEY,
          provider_item_id TEXT NOT NULL UNIQUE,
          sequence INTEGER NOT NULL,
          start_ms INTEGER NOT NULL,
          end_ms INTEGER NOT NULL,
          text TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS transcript_checkpoint_lease_sequence
          ON transcript_checkpoint (lease_id, sequence);
      `);
      this.storage.sql.exec(
        "INSERT INTO _sql_schema_migrations (id, applied_at) VALUES (?, ?)",
        1,
        Date.now(),
      );
    });
    if (version < 2) this.storage.transactionSync(() => {
      const hasStoppedAt = this.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(recorder_session)")
        .toArray()
        .some((column) => column.name === "stopped_at");
      if (!hasStoppedAt) {
        this.storage.sql.exec(
          "ALTER TABLE recorder_session ADD COLUMN stopped_at INTEGER",
        );
      }
      this.storage.sql.exec(
        "INSERT INTO _sql_schema_migrations (id, applied_at) VALUES (?, ?)",
        2,
        Date.now(),
      );
    });
    if (version < 3) this.storage.transactionSync(() => {
      this.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS meeting_document_sync (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          meeting_id TEXT NOT NULL,
          state BLOB NOT NULL,
          attempts INTEGER NOT NULL,
          next_attempt_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      this.storage.sql.exec(
        "INSERT INTO _sql_schema_migrations (id, applied_at) VALUES (?, ?)",
        3,
        Date.now(),
      );
    });
    if (version < 4) this.storage.transactionSync(() => {
      const hasSource = this.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(transcript_checkpoint)")
        .toArray()
        .some((column) => column.name === "source");
      if (!hasSource) {
        this.storage.sql.exec(
          "ALTER TABLE transcript_checkpoint ADD COLUMN source TEXT NOT NULL DEFAULT 'microphone'",
        );
      }
      this.storage.sql.exec(
        "INSERT INTO _sql_schema_migrations (id, applied_at) VALUES (?, ?)",
        4,
        Date.now(),
      );
    });
    if (version < 5) this.storage.transactionSync(() => {
      this.storage.sql.exec(`
        DELETE FROM transcript_checkpoint
        WHERE rowid NOT IN (
          SELECT MIN(rowid)
          FROM transcript_checkpoint
          GROUP BY lease_id, sequence
        );
        CREATE UNIQUE INDEX IF NOT EXISTS transcript_checkpoint_lease_sequence_unique
          ON transcript_checkpoint (lease_id, sequence);
      `);
      this.storage.sql.exec(
        "INSERT INTO _sql_schema_migrations (id, applied_at) VALUES (?, ?)",
        5,
        Date.now(),
      );
    });
    if (version < 6) this.storage.transactionSync(() => {
      this.storage.sql.exec(
        `UPDATE transcript_checkpoint
         SET source = 'microphone'
         WHERE source NOT IN ('microphone', 'system')`,
      );
      this.storage.sql.exec(
        "INSERT INTO _sql_schema_migrations (id, applied_at) VALUES (?, ?)",
        SCHEMA_VERSION,
        Date.now(),
      );
    });
  }

  loadDocument(documentName: string) {
    return Promise.resolve(this.loadDocumentSync(documentName));
  }

  loadDocumentSync(documentName: string) {
    const row = this.storage.sql
      .exec<{ state: ArrayBuffer }>(
        "SELECT state FROM meeting_document WHERE document_name = ? LIMIT 1",
        documentName,
      )
      .toArray()[0];
    return row ? new Uint8Array(row.state) : new Uint8Array();
  }

  hasDocument(documentName: string) {
    return this.storage.sql
      .exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM meeting_document WHERE document_name = ?",
        documentName,
      )
      .one().count > 0;
  }

  storeDocument(documentName: string, state: Uint8Array) {
    this.storage.sql.exec(
      `INSERT INTO meeting_document (document_name, state, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(document_name) DO UPDATE SET
         state = excluded.state,
         updated_at = excluded.updated_at`,
      documentName,
      exactArrayBuffer(state),
      Date.now(),
    );
  }

  claimRecorder(input: Omit<
    MeetingRoomRecorder,
    | "durationMs"
    | "leaseId"
    | "startedAt"
    | "status"
    | "stoppedAt"
    | "updatedAt"
  >) {
    const now = Date.now();
    const existing = this.getRecorder();
    if (existing && existing.expiresAt > now) {
      if (existing.userId === input.userId) return existing;
      throw new Error("Another collaborator is already recording this meeting");
    }
    if (
      existing &&
      (existing.status !== "claimed" || this.hasSegments(existing.leaseId))
    ) {
      throw new Error(
        "The previous recording is being finalized; retry in a moment",
      );
    }
    const recorder: MeetingRoomRecorder = {
      ...input,
      durationMs: 0,
      leaseId: crypto.randomUUID(),
      startedAt: now,
      status: "claimed",
      stoppedAt: null,
      updatedAt: now,
    };
    this.storage.transactionSync(() => {
      this.storage.sql.exec("DELETE FROM recorder_session");
      this.storage.sql.exec("DELETE FROM transcript_checkpoint");
      this.writeRecorder(recorder);
    });
    return recorder;
  }

  getRecorder(): MeetingRoomRecorder | null {
    const row = this.storage.sql
      .exec<RecorderRow>("SELECT * FROM recorder_session WHERE singleton = 1")
      .toArray()[0];
    return row ? fromRecorderRow(row) : null;
  }

  requireRecorder(input: { leaseId: string; meetingId: string; userId: string }) {
    const recorder = this.getRecorder();
    if (
      !recorder ||
      recorder.leaseId !== input.leaseId ||
      recorder.meetingId !== input.meetingId ||
      recorder.userId !== input.userId ||
      recorder.expiresAt <= Date.now()
    ) {
      throw new Error("Recorder lease expired");
    }
    return recorder;
  }

  updateRecorder(
    recorder: MeetingRoomRecorder,
    patch: Partial<
      Pick<
        MeetingRoomRecorder,
        "durationMs" | "expiresAt" | "status" | "stoppedAt"
      >
    >,
  ) {
    const updated = { ...recorder, ...patch, updatedAt: Date.now() };
    this.writeRecorder(updated);
    return updated;
  }

  checkpoint(
    recorder: MeetingRoomRecorder,
    segment: MeetingTranscriptSessionSegment,
    patch: RecorderCheckpointPatch,
  ) {
    const updated = { ...recorder, ...patch, updatedAt: Date.now() };
    let inserted = false;
    this.storage.transactionSync(() => {
      const result = this.storage.sql.exec(
        `INSERT INTO transcript_checkpoint
          (lease_id, id, provider_item_id, sequence, source, start_ms, end_ms, text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        recorder.leaseId,
        segment.id,
        segment.providerItemId,
        segment.sequence,
        segment.source,
        segment.startMs,
        segment.endMs,
        segment.text,
      );
      inserted = result.rowsWritten > 0;
      this.writeRecorder(updated);
    });
    return { inserted, recorder: updated };
  }

  listSegments(leaseId: string): MeetingTranscriptSessionSegment[] {
    return this.storage.sql
      .exec<SegmentRow>(
        `SELECT id, provider_item_id, sequence, source, start_ms, end_ms, text
         FROM transcript_checkpoint
         WHERE lease_id = ?
         ORDER BY sequence`,
        leaseId,
      )
      .toArray()
      .map((row) => ({
        endMs: row.end_ms,
        id: row.id,
        providerItemId: row.provider_item_id,
        sequence: row.sequence,
        source: row.source,
        startMs: row.start_ms,
        text: row.text,
      }));
  }

  completeSession(
    documentName: string,
    meetingId: string,
    state: Uint8Array,
  ) {
    const now = Date.now();
    this.storage.transactionSync(() => {
      this.storeDocument(documentName, state);
      this.storage.sql.exec(
        `INSERT INTO meeting_document_sync
          (singleton, meeting_id, state, attempts, next_attempt_at, updated_at)
         VALUES (1, ?, ?, 0, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET
           meeting_id = excluded.meeting_id,
           state = excluded.state,
           attempts = 0,
           next_attempt_at = excluded.next_attempt_at,
           updated_at = excluded.updated_at`,
        meetingId,
        exactArrayBuffer(state),
        now,
        now,
      );
      this.storage.sql.exec("DELETE FROM transcript_checkpoint");
      this.storage.sql.exec("DELETE FROM recorder_session");
    });
  }

  getDocumentSync(): MeetingRoomDocumentSync | null {
    const row = this.storage.sql
      .exec<DocumentSyncRow>(
        "SELECT * FROM meeting_document_sync WHERE singleton = 1",
      )
      .toArray()[0];
    return row
      ? {
          attempts: row.attempts,
          meetingId: row.meeting_id,
          nextAttemptAt: row.next_attempt_at,
          state: new Uint8Array(row.state),
          updatedAt: row.updated_at,
        }
      : null;
  }

  completeDocumentSync(updatedAt: number) {
    this.storage.sql.exec(
      "DELETE FROM meeting_document_sync WHERE singleton = 1 AND updated_at = ?",
      updatedAt,
    );
  }

  retryDocumentSync(sync: MeetingRoomDocumentSync, nextAttemptAt: number) {
    this.storage.sql.exec(
      `UPDATE meeting_document_sync
       SET attempts = attempts + 1, next_attempt_at = ?
       WHERE singleton = 1 AND updated_at = ?`,
      nextAttemptAt,
      sync.updatedAt,
    );
  }

  releaseRecorder(recorder: MeetingRoomRecorder) {
    this.storage.sql.exec(
      "DELETE FROM recorder_session WHERE singleton = 1 AND lease_id = ?",
      recorder.leaseId,
    );
  }

  private hasSegments(leaseId: string) {
    return this.storage.sql
      .exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM transcript_checkpoint WHERE lease_id = ?",
        leaseId,
      )
      .one().count > 0;
  }

  private writeRecorder(recorder: MeetingRoomRecorder) {
    this.storage.sql.exec(
      `INSERT INTO recorder_session
        (singleton, meeting_id, workspace_id, user_id, lease_id,
         recorder_name, recorder_image, status, started_at, stopped_at,
         duration_ms, expires_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(singleton) DO UPDATE SET
         meeting_id = excluded.meeting_id,
         workspace_id = excluded.workspace_id,
         user_id = excluded.user_id,
         lease_id = excluded.lease_id,
         recorder_name = excluded.recorder_name,
         recorder_image = excluded.recorder_image,
         status = excluded.status,
         started_at = excluded.started_at,
         stopped_at = excluded.stopped_at,
         duration_ms = excluded.duration_ms,
         expires_at = excluded.expires_at,
         updated_at = excluded.updated_at`,
      recorder.meetingId,
      recorder.workspaceId,
      recorder.userId,
      recorder.leaseId,
      recorder.recorderName,
      recorder.recorderImage,
      recorder.status,
      recorder.startedAt,
      recorder.stoppedAt,
      recorder.durationMs,
      recorder.expiresAt,
      recorder.updatedAt,
    );
  }
}

function fromRecorderRow(row: RecorderRow): MeetingRoomRecorder {
  return {
    durationMs: row.duration_ms,
    expiresAt: row.expires_at,
    leaseId: row.lease_id,
    meetingId: row.meeting_id,
    recorderImage: row.recorder_image,
    recorderName: row.recorder_name,
    startedAt: row.started_at,
    status: row.status,
    stoppedAt: row.stopped_at,
    updatedAt: row.updated_at,
    userId: row.user_id,
    workspaceId: row.workspace_id,
  };
}

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
