import type {
  MeetingCaptureSource,
  RecoverableMeetingCapture,
} from "./types"

const DATABASE_NAME = "zilobase-meeting-capture-v1"
const DATABASE_VERSION = 1
const SESSIONS = "sessions"
const CHUNKS = "chunks"

type RecoverySession = {
  elapsedMs: number
  meetingId: string
  sampleRate: number
  sources: MeetingCaptureSource[]
  startedAtEpochMs: number
}

type RecoveryChunk = {
  index: number
  meetingId: string
  pcm: ArrayBuffer
  source: MeetingCaptureSource
}

export async function beginBrowserMeetingRecovery(
  meetingId: string,
  sources: MeetingCaptureSource[],
) {
  const session: RecoverySession = {
    elapsedMs: 0,
    meetingId,
    sampleRate: 24_000,
    sources,
    startedAtEpochMs: Date.now(),
  }
  const database = await openDatabase()
  await transactionDone(database, [SESSIONS, CHUNKS], "readwrite", (transaction) => {
    transaction.objectStore(SESSIONS).put(session)
    const chunks = transaction.objectStore(CHUNKS)
    const request = chunks.index("meetingId").openKeyCursor(IDBKeyRange.only(meetingId))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      chunks.delete(cursor.primaryKey)
      cursor.continue()
    }
  })
  if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false)
}

export async function appendBrowserMeetingRecoveryChunk(
  meetingId: string,
  source: MeetingCaptureSource,
  index: number,
  samples: Int16Array,
) {
  const copy = new Int16Array(samples).buffer
  await put(CHUNKS, {
    index,
    meetingId,
    pcm: copy,
    source,
  } satisfies RecoveryChunk)
}

export async function finishBrowserMeetingRecovery(
  meetingId: string,
  elapsedMs: number,
) {
  const session = await get<RecoverySession>(SESSIONS, meetingId)
  if (session) await put(SESSIONS, { ...session, elapsedMs })
}

export async function listBrowserMeetingRecovery() {
  const sessions = await getAll<RecoverySession>(SESSIONS)
  return sessions
    .sort((left, right) => right.startedAtEpochMs - left.startedAtEpochMs)
    .map((session): RecoverableMeetingCapture => ({
      audioPath: `indexeddb://${DATABASE_NAME}/${session.meetingId}`,
      elapsedMs: session.elapsedMs,
      meetingId: session.meetingId,
      sampleRate: session.sampleRate,
      startedAtEpochMs: session.startedAtEpochMs,
    }))
}

export async function deleteBrowserMeetingRecovery(meetingId: string) {
  const database = await openDatabase()
  await transactionDone(database, [SESSIONS, CHUNKS], "readwrite", (transaction) => {
    transaction.objectStore(SESSIONS).delete(meetingId)
    const chunks = transaction.objectStore(CHUNKS)
    const request = chunks.index("meetingId").openKeyCursor(IDBKeyRange.only(meetingId))
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      chunks.delete(cursor.primaryKey)
      cursor.continue()
    }
  })
}

export async function downloadBrowserMeetingRecovery(meetingId: string) {
  const session = await get<RecoverySession>(SESSIONS, meetingId)
  if (!session) throw new Error("No local audio checkpoint exists for this meeting.")
  const chunks = (await getAllFromIndex<RecoveryChunk>(CHUNKS, "meetingId", meetingId))
    .sort((left, right) => left.index - right.index)
  const bySource = new Map<MeetingCaptureSource, Int16Array[]>()
  for (const chunk of chunks) {
    const values = bySource.get(chunk.source) ?? []
    values.push(new Int16Array(chunk.pcm))
    bySource.set(chunk.source, values)
  }
  const microphone = concatenate(bySource.get("microphone") ?? [])
  const system = concatenate(bySource.get("system") ?? [])
  if (!microphone.length && !system.length) {
    throw new Error("The local audio checkpoint is empty.")
  }
  const wav = createRecoveryWav(microphone, system, session.sampleRate)
  const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }))
  const anchor = document.createElement("a")
  anchor.download = `meeting-${meetingId}.wav`
  anchor.href = url
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function concatenate(chunks: Int16Array[]) {
  const result = new Int16Array(
    chunks.reduce((total, chunk) => total + chunk.length, 0),
  )
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

export function createRecoveryWav(
  microphone: Int16Array,
  system: Int16Array,
  sampleRate = 24_000,
) {
  const stereo = microphone.length > 0 && system.length > 0
  const channels = stereo ? 2 : 1
  const frames = Math.max(microphone.length, system.length)
  const bytes = new Uint8Array(44 + frames * channels * 2)
  const view = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode("RIFF"), 0)
  view.setUint32(4, bytes.byteLength - 8, true)
  bytes.set(new TextEncoder().encode("WAVEfmt "), 8)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  bytes.set(new TextEncoder().encode("data"), 36)
  view.setUint32(40, bytes.byteLength - 44, true)
  let offset = 44
  for (let index = 0; index < frames; index += 1) {
    if (stereo) {
      view.setInt16(offset, microphone[index] ?? 0, true)
      view.setInt16(offset + 2, system[index] ?? 0, true)
      offset += 4
    } else {
      view.setInt16(offset, (microphone.length ? microphone : system)[index] ?? 0, true)
      offset += 2
    }
  }
  return bytes
}

function openDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Browser audio recovery is unavailable."))
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(SESSIONS)) {
        database.createObjectStore(SESSIONS, { keyPath: "meetingId" })
      }
      if (!database.objectStoreNames.contains(CHUNKS)) {
        const store = database.createObjectStore(CHUNKS, {
          keyPath: ["meetingId", "source", "index"],
        })
        store.createIndex("meetingId", "meetingId")
      }
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

async function put(store: string, value: unknown) {
  const database = await openDatabase()
  await transactionDone(database, [store], "readwrite", (transaction) => {
    transaction.objectStore(store).put(value)
  })
}

async function get<T>(store: string, key: IDBValidKey) {
  const database = await openDatabase()
  return requestResult<T | undefined>(database.transaction(store).objectStore(store).get(key))
}

async function getAll<T>(store: string) {
  const database = await openDatabase()
  return requestResult<T[]>(database.transaction(store).objectStore(store).getAll())
}

async function getAllFromIndex<T>(store: string, index: string, key: IDBValidKey) {
  const database = await openDatabase()
  return requestResult<T[]>(
    database.transaction(store).objectStore(store).index(index).getAll(key),
  )
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionDone(
  database: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(stores, mode)
    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    run(transaction)
  })
}
