import {
  appendBrowserMeetingRecoveryChunk,
  beginBrowserMeetingRecovery,
  deleteBrowserMeetingRecovery,
  downloadBrowserMeetingRecovery,
  finishBrowserMeetingRecovery,
  listBrowserMeetingRecovery,
} from "./browser-meeting-recovery"
import type {
  MeetingAudioDevice,
  MeetingCapturePrepareConfig,
  MeetingCaptureSource,
  MeetingCaptureStartConfig,
  MeetingCaptureStatus,
  MeetingTranscriptDraft,
} from "./meeting-capture-types"

const SAMPLE_RATE = 24_000
const FRAME_SAMPLES = 480
const TRANSPORT_BATCH_FRAMES = 5
const MAX_CAPTURE_MS = 3 * 60 * 60 * 1_000
const RECOVERY_CHUNK_SAMPLES = SAMPLE_RATE * 5
const MAX_TRANSPORT_FRAMES = 1_500
const MAX_CAPTURE_CATCH_UP_FRAMES = 25

type Listener = () => void

type ActiveBrowserCapture = {
  activeSources: MeetingCaptureSource[]
  audioContext: AudioContext
  audioNodes: AudioNode[]
  captureStartedAt: number
  chunkIndexes: Record<MeetingCaptureSource, number>
  displayStream: MediaStream | null
  microphoneStream: MediaStream | null
  queues: Record<MeetingCaptureSource, SampleQueue>
  recovery: Record<MeetingCaptureSource, number[]>
  recoveryWrites: Promise<void>
  resamplers: Record<MeetingCaptureSource, StreamingResampler>
  timer: number
  transport: BrowserMeetingTransport
}

type PreparedBrowserCapture = {
  audioContext: AudioContext
  config: MeetingCapturePrepareConfig
  displayStream: MediaStream | null
  microphoneStream: MediaStream | null
  warnings: string[]
}

export class BrowserMeetingCapture {
  private active: ActiveBrowserCapture | null = null
  private readonly listeners = new Set<Listener>()
  private preparationVersion = 0
  private prepared: PreparedBrowserCapture | null = null
  level = 0
  liveTranscripts: MeetingTranscriptDraft[] | undefined = undefined
  recovery = null as Awaited<ReturnType<typeof listBrowserMeetingRecovery>>[number] | null
  status: MeetingCaptureStatus | null = null

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async listDevices(): Promise<MeetingAudioDevice[]> {
    if (!navigator.mediaDevices) return []
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [])
    const microphones = devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index): MeetingAudioDevice => ({
        backend: "web-media",
        captureMode: "microphone",
        id: device.deviceId,
        isDefault: device.deviceId === "default" || index === 0,
        isSystemCaptureCandidate: false,
        kind: "microphone",
        name: device.label || `Microphone ${index + 1}`,
      }))
    if (supportsDisplayAudio()) {
      microphones.push({
        backend: "display-media",
        captureMode: "native-loopback",
        id: "browser:system",
        isDefault: true,
        isSystemCaptureCandidate: true,
        kind: "system",
        name: "Shared tab or system audio",
      })
    }
    return microphones
  }

  async loadRecovery(meetingId: string) {
    this.recovery = (await listBrowserMeetingRecovery().catch(() => []))
      .find((session) => session.meetingId === meetingId) ?? null
    this.emit()
  }

  async prepare(config: MeetingCapturePrepareConfig) {
    if (this.active) throw new Error("Another meeting is already being captured in this tab.")
    if (!navigator.mediaDevices) throw new Error("Audio capture is unavailable in this browser.")
    this.disposePrepared()
    const version = ++this.preparationVersion
    const warnings: string[] = []

    // Both permission APIs must be invoked before the first await so that
    // getDisplayMedia still has the consent button's transient user activation.
    let displayPromise: Promise<MediaStream | null>
    if (config.captureSystemAudio && supportsDisplayAudio()) {
      displayPromise = navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
      }).catch(() => {
        warnings.push("System audio was not shared; recording microphone only.")
        return null
      })
    } else {
      if (config.captureSystemAudio) {
        warnings.push("System audio is unavailable in this browser; recording microphone only.")
      }
      displayPromise = Promise.resolve(null)
    }
    const microphonePromise = config.captureMicrophone
      ? navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            deviceId: config.microphoneDeviceId && config.microphoneDeviceId !== "default"
              ? { exact: config.microphoneDeviceId }
              : undefined,
            echoCancellation: true,
            noiseSuppression: true,
          },
        }).catch(() => {
          warnings.push("Microphone access was unavailable; recording system audio only.")
          return null
        })
      : Promise.resolve(null)
    const audioContext = new AudioContext({ latencyHint: "interactive", sampleRate: SAMPLE_RATE })
    const audioReady = audioContext.resume().catch(() => undefined)

    const [displayStream, microphoneStream] = await Promise.all([
      displayPromise,
      microphonePromise,
      audioReady,
    ])
    if (version !== this.preparationVersion) {
      displayStream?.getTracks().forEach((track) => track.stop())
      microphoneStream?.getTracks().forEach((track) => track.stop())
      await audioContext.close().catch(() => undefined)
      return
    }
    let usableDisplayStream = displayStream
    if (usableDisplayStream && usableDisplayStream.getAudioTracks().length === 0) {
      usableDisplayStream.getTracks().forEach((track) => track.stop())
      usableDisplayStream = null
      warnings.push("The selected share did not include audio; recording microphone only.")
    }
    this.prepared = {
      audioContext,
      config: { ...config },
      displayStream: usableDisplayStream,
      microphoneStream,
      warnings,
    }
  }

  async cancelPreparation() {
    this.preparationVersion += 1
    this.disposePrepared()
  }

  async start(config: MeetingCaptureStartConfig) {
    if (this.active) throw new Error("Another meeting is already being captured in this tab.")
    if (!navigator.mediaDevices) throw new Error("Audio capture is unavailable in this browser.")
    this.setStatus({
      activeSources: [],
      checkpointPath: `indexeddb://zilobase-meeting-capture-v1/${config.meetingId}`,
      elapsedMs: 0,
      error: null,
      meetingId: config.meetingId,
      phase: "starting",
      sampleRate: SAMPLE_RATE,
      warnings: [],
    })

    if (!this.prepared || !preparationMatches(this.prepared.config, config)) {
      await this.prepare(config)
    }
    const prepared = this.prepared
    this.prepared = null
    if (!prepared) throw new Error("Audio permission setup was cancelled.")
    const { audioContext, displayStream, microphoneStream, warnings } = prepared

    const activeSources: MeetingCaptureSource[] = []
    if (microphoneStream?.getAudioTracks().length) activeSources.push("microphone")
    if (displayStream?.getAudioTracks().length) activeSources.push("system")
    if (activeSources.length === 0) {
      displayStream?.getTracks().forEach((track) => track.stop())
      microphoneStream?.getTracks().forEach((track) => track.stop())
      await audioContext.close().catch(() => undefined)
      throw new Error("Allow microphone or system-audio access to start recording.")
    }

    try {
      await audioContext.resume()
      const queues = {
        microphone: new SampleQueue(),
        system: new SampleQueue(),
      }
      const resamplers = {
        microphone: new StreamingResampler(audioContext.sampleRate, SAMPLE_RATE),
        system: new StreamingResampler(audioContext.sampleRate, SAMPLE_RATE),
      }
      const audioNodes: AudioNode[] = []
      const useAudioWorklet = Boolean(audioContext.audioWorklet)
        && typeof AudioWorkletNode !== "undefined"
        && await prepareAudioWorklet(audioContext).then(
          () => true,
          () => {
            warnings.push("AudioWorklet was unavailable; using the browser compatibility path.")
            return false
          },
        )
      if (microphoneStream) {
        audioNodes.push(...attachStream(
          audioContext,
          microphoneStream,
          (samples) => queues.microphone.push(resamplers.microphone.process(samples)),
          useAudioWorklet,
        ))
      }
      if (displayStream) {
        audioNodes.push(...attachStream(
          audioContext,
          displayStream,
          (samples) => queues.system.push(resamplers.system.process(samples)),
          useAudioWorklet,
        ))
      }

      await beginBrowserMeetingRecovery(config.meetingId, activeSources).catch(() => {
        warnings.push("Local recovery is unavailable; live transcription will continue.")
      })
      const transport = new BrowserMeetingTransport(
        config.audioWebsocketUrl,
        config.audioTicket,
        (message) => this.warn(message),
        undefined,
        (draft) => {
          if (!draft) {
            this.liveTranscripts = []
          } else {
            const next = (this.liveTranscripts ?? []).filter(
              (current) => current.source !== draft.source,
            )
            if (draft.text) next.push({ ...draft, meetingId: config.meetingId })
            this.liveTranscripts = next
          }
          this.emit()
        },
        activeSources,
      )
      transport.start()
      const active: ActiveBrowserCapture = {
        activeSources,
        audioContext,
        audioNodes,
        captureStartedAt: performance.now(),
        chunkIndexes: { microphone: 0, system: 0 },
        displayStream,
        microphoneStream,
        queues,
        recovery: { microphone: [], system: [] },
        recoveryWrites: Promise.resolve(),
        resamplers,
        timer: 0,
        transport,
      }
      active.timer = window.setInterval(() => this.processFrame(), 20)
      this.active = active
      microphoneStream?.getAudioTracks()[0]?.addEventListener("ended", () => {
        this.sourceEnded("microphone")
      })
      displayStream?.getAudioTracks()[0]?.addEventListener("ended", () => {
        this.sourceEnded("system")
      })
      this.setStatus({
        ...this.status!,
        activeSources,
        phase: "recording",
        warnings,
      })
      return this.status!
    } catch (error) {
      displayStream?.getTracks().forEach((track) => track.stop())
      microphoneStream?.getTracks().forEach((track) => track.stop())
      await audioContext.close().catch(() => undefined)
      const message = error instanceof Error ? error.message : "Could not initialize audio capture."
      this.setStatus({ ...this.status!, error: message, phase: "error" })
      throw error
    }
  }

  async pause() {
    if (!this.active || !this.status) throw new Error("No meeting capture is active.")
    await this.active.audioContext.suspend()
    try {
      await this.active.transport.pause()
    } catch (error) {
      await this.active.audioContext.resume().catch(() => undefined)
      await this.active.transport.resume().catch(() => undefined)
      throw error
    }
    this.setStatus({ ...this.status, phase: "paused" })
    return this.status!
  }

  async resume() {
    if (!this.active || !this.status) throw new Error("No meeting capture is active.")
    this.active.captureStartedAt = performance.now()
    await this.active.transport.resume()
    try {
      await this.active.audioContext.resume()
    } catch (error) {
      await this.active.transport.pause().catch(() => undefined)
      throw error
    }
    this.setStatus({ ...this.status, phase: "recording" })
    return this.status!
  }

  async stop() {
    const active = this.active
    if (!active || !this.status) throw new Error("No meeting capture is active.")
    window.clearInterval(active.timer)
    this.active = null
    this.flushRecovery(active, "microphone", true)
    this.flushRecovery(active, "system", true)
    await active.recoveryWrites.catch(() => undefined)
    const elapsedMs = this.status.elapsedMs
    const meetingId = this.status.meetingId!
    try {
      await active.transport.stop(elapsedMs)
    } finally {
      this.liveTranscripts = []
      active.microphoneStream?.getTracks().forEach((track) => track.stop())
      active.displayStream?.getTracks().forEach((track) => track.stop())
      active.audioNodes.forEach((node) => node.disconnect())
      await active.audioContext.close().catch(() => undefined)
      await finishBrowserMeetingRecovery(meetingId, elapsedMs).catch(() => undefined)
      this.setStatus({ ...this.status!, activeSources: [], phase: "stopped" })
      await this.loadRecovery(meetingId)
    }
    return this.status!
  }

  async refreshTransport(audioWebsocketUrl: string, audioTicket: string) {
    this.active?.transport.refresh(audioWebsocketUrl, audioTicket)
  }

  async deleteLocalFile(meetingId: string) {
    await deleteBrowserMeetingRecovery(meetingId)
    this.recovery = null
    this.emit()
  }

  async openLocalFile(meetingId: string) {
    await downloadBrowserMeetingRecovery(meetingId)
  }

  private processFrame() {
    const active = this.active
    const status = this.status
    if (!active || !status || status.phase !== "recording") return
    if (performance.now() - active.captureStartedAt < 100) return
    const sourceFrameCounts: Record<MeetingCaptureSource, number> = {
      microphone: active.activeSources.includes("microphone")
        ? Math.min(
            MAX_CAPTURE_CATCH_UP_FRAMES,
            Math.floor(active.queues.microphone.available / FRAME_SAMPLES),
          )
        : 0,
      system: active.activeSources.includes("system")
        ? Math.min(
            MAX_CAPTURE_CATCH_UP_FRAMES,
            Math.floor(active.queues.system.available / FRAME_SAMPLES),
          )
        : 0,
    }
    const frameCount = Math.max(
      sourceFrameCounts.microphone,
      sourceFrameCounts.system,
    )
    if (frameCount === 0) return

    let level = 0
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const microphone = frameIndex < sourceFrameCounts.microphone
        ? active.queues.microphone.take(FRAME_SAMPLES)
        : new Float32Array(FRAME_SAMPLES)
      const system = frameIndex < sourceFrameCounts.system
        ? active.queues.system.take(FRAME_SAMPLES)
        : new Float32Array(FRAME_SAMPLES)
      const mixed = mixSources(microphone, system, active.activeSources)
      if (frameIndex < sourceFrameCounts.microphone) {
        active.transport.send(microphone, "microphone")
        active.recovery.microphone.push(...floatToPcm(microphone))
        this.flushRecovery(active, "microphone")
      }
      if (frameIndex < sourceFrameCounts.system) {
        active.transport.send(system, "system")
        active.recovery.system.push(...floatToPcm(system))
        this.flushRecovery(active, "system")
      }
      const peak = mixed.reduce(
        (value, sample) => Math.max(value, Math.abs(sample)),
        0,
      )
      const rms = Math.sqrt(
        mixed.reduce((value, sample) => value + sample * sample, 0) /
          mixed.length,
      )
      level = Math.max(level, Math.min(1, Math.max(peak, rms * 4)))
    }
    this.level = level
    const elapsedMs = Math.min(
      MAX_CAPTURE_MS,
      status.elapsedMs + frameCount * 20,
    )
    this.status = { ...status, elapsedMs }
    this.emit()
    if (elapsedMs >= MAX_CAPTURE_MS) {
      this.warn("The three-hour recording limit was reached; the meeting was stopped.")
      void this.stop().catch((error) => {
        this.warn(error instanceof Error
          ? error.message
          : "The meeting could not be finalized automatically.")
      })
    } else if (Math.max(
      active.activeSources.includes("microphone")
        ? active.queues.microphone.available
        : 0,
      active.activeSources.includes("system")
        ? active.queues.system.available
        : 0,
    ) >= FRAME_SAMPLES) {
      // Once a throttled interval gets one execution turn, microtasks can
      // drain the remaining bounded chunks without waiting for another
      // background-tab timer tick.
      queueMicrotask(() => this.processFrame())
    }
  }

  private sourceEnded(source: MeetingCaptureSource) {
    if (!this.active || !this.status) return
    this.active.activeSources = this.active.activeSources.filter(
      (current) => current !== source,
    )
    const label = source === "system" ? "System sharing" : "Microphone capture"
    const continuation = this.active.activeSources.length
      ? "continuing with the remaining source."
      : "no audio source remains. Stop this recording and reconnect a device."
    this.warn(`${label} stopped; ${continuation}`)
    this.setStatus({
      ...this.status,
      activeSources: this.active.activeSources,
    })
  }

  private flushRecovery(
    active: ActiveBrowserCapture,
    source: MeetingCaptureSource,
    force = false,
  ) {
    const samples = active.recovery[source]
    if (!force && samples.length < RECOVERY_CHUNK_SAMPLES) return
    if (samples.length === 0) return
    const count = force ? samples.length : RECOVERY_CHUNK_SAMPLES
    const chunk = Int16Array.from(samples.splice(0, count))
    const index = active.chunkIndexes[source]++
    active.recoveryWrites = active.recoveryWrites
      .then(() => appendBrowserMeetingRecoveryChunk(
        this.status!.meetingId!, source, index, chunk,
      ))
      .catch(() => this.warn("Local recovery ran out of storage; live transcription continues."))
  }

  private warn(message: string) {
    if (!this.status || this.status.warnings?.includes(message)) return
    this.status = {
      ...this.status,
      warnings: [...(this.status.warnings ?? []), message],
    }
    this.emit()
  }

  private setStatus(status: MeetingCaptureStatus) {
    this.status = status
    this.emit()
  }

  private emit() {
    this.listeners.forEach((listener) => listener())
  }

  private disposePrepared() {
    void this.prepared?.audioContext.close().catch(() => undefined)
    this.prepared?.displayStream?.getTracks().forEach((track) => track.stop())
    this.prepared?.microphoneStream?.getTracks().forEach((track) => track.stop())
    this.prepared = null
  }
}

function preparationMatches(
  prepared: MeetingCapturePrepareConfig,
  requested: MeetingCapturePrepareConfig,
) {
  return prepared.meetingId === requested.meetingId
    && prepared.captureMicrophone === requested.captureMicrophone
    && prepared.captureSystemAudio === requested.captureSystemAudio
    && prepared.microphoneDeviceId === requested.microphoneDeviceId
    && prepared.systemDeviceId === requested.systemDeviceId
}

function supportsDisplayAudio() {
  return typeof (navigator.mediaDevices as Partial<MediaDevices>).getDisplayMedia === "function"
}

class SampleQueue {
  private offset = 0
  private samples: number[] = []

  get available() {
    return this.samples.length - this.offset
  }

  push(values: Float32Array) {
    this.samples.push(...values)
  }

  take(count: number) {
    const result = new Float32Array(count)
    const available = Math.min(count, this.samples.length - this.offset)
    for (let index = 0; index < available; index += 1) {
      result[index] = this.samples[this.offset + index]
    }
    this.offset += available
    if (this.offset > 4_800) {
      this.samples = this.samples.slice(this.offset)
      this.offset = 0
    }
    return result
  }
}

export class StreamingResampler {
  private readonly input: number[] = []
  private position = 0
  private readonly ratio: number

  constructor(fromRate: number, toRate: number) {
    this.ratio = fromRate / toRate
  }

  process(samples: Float32Array) {
    if (this.ratio === 1) return samples
    this.input.push(...samples)
    const output: number[] = []
    while (this.position + 1 < this.input.length) {
      const lower = Math.floor(this.position)
      const fraction = this.position - lower
      output.push(
        this.input[lower] + (this.input[lower + 1] - this.input[lower]) * fraction,
      )
      this.position += this.ratio
    }
    const consumed = Math.floor(this.position)
    if (consumed > 0) {
      this.input.splice(0, consumed)
      this.position -= consumed
    }
    return Float32Array.from(output)
  }
}

export function mixSources(
  microphone: Float32Array,
  system: Float32Array,
  activeSources: MeetingCaptureSource[],
) {
  const output = new Float32Array(FRAME_SAMPLES)
  const sourceCount = Math.max(1, activeSources.length)
  for (let index = 0; index < output.length; index += 1) {
    const value = (
      (activeSources.includes("microphone") ? microphone[index] : 0) +
      (activeSources.includes("system") ? system[index] : 0)
    ) / sourceCount
    output[index] = Math.tanh(value)
  }
  return output
}

function floatToPcm(samples: Float32Array) {
  const output = new Int16Array(samples.length)
  for (let index = 0; index < samples.length; index += 1) {
    output[index] = Math.round(Math.max(-1, Math.min(1, samples[index])) * 0x7fff)
  }
  return output
}

const workletModules = new WeakMap<AudioContext, Promise<void>>()

function prepareAudioWorklet(context: AudioContext) {
  if (!context.audioWorklet || typeof AudioWorkletNode === "undefined") {
    return Promise.resolve()
  }
  let workletModule = workletModules.get(context)
  if (!workletModule) {
    const source = `
      class ZilobaseMeetingCaptureProcessor extends AudioWorkletProcessor {
        process(inputs) {
          const input = inputs[0] && inputs[0][0]
          if (input) {
            const copy = input.slice()
            this.port.postMessage(copy.buffer, [copy.buffer])
          }
          return true
        }
      }
      registerProcessor('zilobase-meeting-capture', ZilobaseMeetingCaptureProcessor)
    `
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }))
    workletModule = context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url))
    workletModules.set(context, workletModule)
  }
  return workletModule
}

function attachStream(
  context: AudioContext,
  stream: MediaStream,
  onSamples: (samples: Float32Array) => void,
  useAudioWorklet: boolean,
) {
  const source = context.createMediaStreamSource(stream)
  const sink = context.createGain()
  sink.gain.value = 0
  if (useAudioWorklet) {
    const capture = new AudioWorkletNode(context, "zilobase-meeting-capture")
    capture.port.onmessage = (event) => onSamples(new Float32Array(event.data))
    source.connect(capture).connect(sink).connect(context.destination)
    return [source, capture, sink]
  }
  const capture = context.createScriptProcessor(1_024, 1, 1)
  capture.onaudioprocess = (event) => onSamples(event.inputBuffer.getChannelData(0).slice())
  source.connect(capture).connect(sink).connect(context.destination)
  return [source, capture, sink]
}

type BrowserMeetingTransportState = "failed" | "paused" | "recording" | "stopped"

type BrowserMeetingTransportDependencies = {
  clearTimeout: (timer: number) => void
  createSocket: (url: string, protocols: string[]) => WebSocket
  resolveUrl: (url: string) => URL
  setTimeout: (callback: () => void, delay: number) => number
}

const defaultBrowserMeetingTransportDependencies: BrowserMeetingTransportDependencies = {
  clearTimeout: (timer) => window.clearTimeout(timer),
  createSocket: (url, protocols) => new WebSocket(url, protocols),
  resolveUrl: (url) => new URL(url, window.location.href),
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
}

const MAX_TRANSCRIPTION_RECONNECT_ATTEMPTS = 6
const MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE = 4400
const TRANSCRIPTION_STABLE_CONNECTION_MS = 30_000

export class BrowserMeetingTransport {
  private audioTicket: string
  private audioWebsocketUrl: string
  private readonly dependencies: BrowserMeetingTransportDependencies
  private readonly onWarning: (message: string) => void
  private readonly onTranscript: (
    draft: Omit<MeetingTranscriptDraft, "meetingId"> | null,
  ) => void
  private readonly activeSources: MeetingCaptureSource[]
  private inFlight: Uint8Array[] = []
  private pendingSamples: Record<MeetingCaptureSource, Float32Array[]> = {
    microphone: [],
    system: [],
  }
  private pendingSampleCounts: Record<MeetingCaptureSource, number> = {
    microphone: 0,
    system: 0,
  }
  private pendingSequences: Record<MeetingCaptureSource, number | null> = {
    microphone: null,
    system: null,
  }
  private queue: Uint8Array[] = []
  private reconnectAttempt = 0
  private reconnectResetTimer: number | null = null
  private reconnectTimer: number | null = null
  private sequences: Record<MeetingCaptureSource, number> = {
    microphone: 0,
    system: 0,
  }
  private socket: WebSocket | null = null
  private state: BrowserMeetingTransportState = "stopped"
  private providerReady = false
  private readonly eventWaiters = new Map<string, {
    reject: (reason: Error) => void
    resolve: () => void
    timer: number
  }>()

  constructor(
    url: string,
    ticket: string,
    onWarning: (message: string) => void,
    dependencies: BrowserMeetingTransportDependencies = defaultBrowserMeetingTransportDependencies,
    onTranscript: (
      draft: Omit<MeetingTranscriptDraft, "meetingId"> | null,
    ) => void = () => undefined,
    activeSources: MeetingCaptureSource[] = ["microphone"],
  ) {
    this.audioWebsocketUrl = url
    this.audioTicket = ticket
    this.dependencies = dependencies
    this.onWarning = onWarning
    this.onTranscript = onTranscript
    this.activeSources = [...activeSources]
  }

  start() {
    if (this.state !== "stopped") return
    this.reconnectAttempt = 0
    this.state = "recording"
    this.connect()
  }

  async pause() {
    if (this.state !== "recording") return
    this.flushSamples()
    this.drainQueue(true)
    this.state = "paused"
    this.cancelReconnect()
    this.cancelReconnectReset()
    if (this.socket?.readyState === 1) {
      const paused = this.waitForEvent("recording.paused")
      this.socket.send(JSON.stringify({ type: "recording.pause" }))
      await paused
    }
  }

  async resume() {
    if (this.state !== "paused") return
    this.state = "recording"
    this.providerReady = false
    const ready = this.waitForEvent("meeting.ready")
    if (this.socket?.readyState === 1) {
      this.socket.send(JSON.stringify({ type: "recording.resume" }))
    } else {
      this.connect()
    }
    await ready
  }

  refresh(url: string, ticket: string) {
    this.audioWebsocketUrl = url
    this.audioTicket = ticket
    if (this.state === "recording" && (!this.socket || this.socket.readyState >= 2)) {
      this.cancelReconnect()
      this.connect()
    }
  }

  send(samples: Float32Array, source: MeetingCaptureSource = "microphone") {
    if (this.state !== "recording" || !this.activeSources.includes(source)) return
    const sequence = this.sequences[source]++
    this.pendingSequences[source] ??= sequence
    this.pendingSamples[source].push(samples.slice())
    this.pendingSampleCounts[source] += samples.length
    if (this.pendingSampleCounts[source] < FRAME_SAMPLES * TRANSPORT_BATCH_FRAMES) return
    this.flushSourceSamples(source)
  }

  private flushSamples() {
    for (const source of this.activeSources) this.flushSourceSamples(source)
  }

  private flushSourceSamples(source: MeetingCaptureSource) {
    const pendingSampleCount = this.pendingSampleCounts[source]
    const pendingSequence = this.pendingSequences[source]
    if (pendingSampleCount === 0 || pendingSequence === null) return
    const samples = new Float32Array(pendingSampleCount)
    let sampleOffset = 0
    for (const chunk of this.pendingSamples[source]) {
      samples.set(chunk, sampleOffset)
      sampleOffset += chunk.length
    }
    const frame = new Uint8Array(9 + samples.length * 2)
    const view = new DataView(frame.buffer)
    view.setBigUint64(0, BigInt(pendingSequence), true)
    view.setUint8(8, meetingAudioSourceCode(source))
    for (let index = 0; index < samples.length; index += 1) {
      view.setInt16(9 + index * 2, Math.round(
        Math.max(-1, Math.min(1, samples[index])) * 0x7fff,
      ), true)
    }
    this.pendingSamples[source] = []
    this.pendingSampleCounts[source] = 0
    this.pendingSequences[source] = null
    this.enqueueFrame(frame)
    this.drainQueue()
  }

  async stop(durationMs: number) {
    if (this.state === "stopped") return
    if (this.state === "failed") {
      this.state = "stopped"
      this.rejectEventWaiters(new Error("Meeting transcription is unavailable."))
      return
    }
    this.flushSamples()
    this.cancelReconnect()
    this.cancelReconnectReset()
    if (this.socket?.readyState !== 1 || !this.providerReady) {
      this.state = "recording"
      this.providerReady = false
      const ready = this.waitForEvent("meeting.ready")
      this.connect()
      try {
        await ready
      } catch (error) {
        this.state = "stopped"
        this.closeSocket("Meeting stopped")
        throw error
      }
    }
    this.drainQueue(true)
    this.state = "stopped"
    const completed = this.waitForEvent("recording.flush.completed", 20_000)
    this.socket!.send(JSON.stringify({ durationMs, type: "recording.stop" }))
    try {
      await completed
    } finally {
      this.closeSocket("Meeting stopped")
    }
  }

  private connect() {
    if (this.state !== "recording") return
    if (this.socket && this.socket.readyState < 2) return
    const url = this.dependencies.resolveUrl(this.audioWebsocketUrl)
    const socket = this.dependencies.createSocket(url.toString(), [
      "zilobase.meeting-audio.v2",
      `zilobase.meeting-audio.auth.${this.audioTicket}`,
    ])
    this.providerReady = false
    socket.binaryType = "arraybuffer"
    socket.onopen = () => {
      if (this.socket !== socket || this.state !== "recording") {
        socket.close(1000, "Meeting capture inactive")
        return
      }
      socket.send(JSON.stringify({
        sources: this.activeSources,
        type: "recording.configure",
      }))
    }
    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.socket = null
      this.providerReady = false
      this.cancelReconnectReset()
      if (this.state !== "recording") {
        this.rejectEventWaiters(new Error("Meeting transcription connection closed."))
        return
      }
      if (event.code === MEETING_TRANSCRIPTION_FATAL_CLOSE_CODE) {
        this.failPermanently(
          "Meeting transcription could not start. Check the configured transcription model and API access; local recording continues.",
        )
        return
      }
      if (this.reconnectAttempt >= MAX_TRANSCRIPTION_RECONNECT_ATTEMPTS) {
        this.failPermanently(
          "Meeting transcription is unavailable after repeated reconnects; local recording continues.",
        )
        return
      }
      this.onWarning("Meeting transcription disconnected; local recording continues.")
      const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempt++)
      this.reconnectTimer = this.dependencies.setTimeout(() => {
        this.reconnectTimer = null
        this.connect()
      }, delay)
    }
    socket.onmessage = (event) => {
      if (this.socket !== socket || typeof event.data !== "string") return
      const control = parseMeetingAudioEvent(event.data)
      if (control?.type === "meeting.ready") {
        const nextSequences = readNextMeetingAudioSequences(control.nextSequences)
        if (nextSequences) this.reconcileFrames(nextSequences)
        this.providerReady = true
        this.resolveEventWaiter("meeting.ready")
        this.cancelReconnectReset()
        this.reconnectResetTimer = this.dependencies.setTimeout(() => {
          this.reconnectResetTimer = null
          if (this.socket === socket && this.providerReady) {
            this.reconnectAttempt = 0
          }
        }, TRANSCRIPTION_STABLE_CONNECTION_MS)
        this.drainQueue()
        return
      }
      if (control?.type === "recording.paused") {
        this.resolveEventWaiter("recording.paused")
        return
      }
      if (control?.type === "recording.flush.completed") {
        this.resolveEventWaiter("recording.flush.completed")
        return
      }
      if (control?.type === "recording.ticket" && typeof control.token === "string") {
        this.audioTicket = control.token
        return
      }
      if (control?.type === "recording.error") {
        this.rejectEventWaiters(new Error(
          typeof control.message === "string"
            ? control.message
            : "Meeting recording failed.",
        ))
        return
      }
      const draft = parseTranscriptDelta(event.data)
      if (draft !== undefined) this.onTranscript(draft)
    }
    socket.onerror = () => {
      if (this.socket !== socket || this.state !== "recording") return
      socket.close()
    }
    this.socket = socket
  }

  private cancelReconnect() {
    if (this.reconnectTimer === null) return
    this.dependencies.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private cancelReconnectReset() {
    if (this.reconnectResetTimer === null) return
    this.dependencies.clearTimeout(this.reconnectResetTimer)
    this.reconnectResetTimer = null
  }

  private closeSocket(reason: string) {
    this.cancelReconnectReset()
    const socket = this.socket
    this.socket = null
    if (socket && socket.readyState < 2) socket.close(1000, reason)
  }

  private failPermanently(message: string) {
    this.state = "failed"
    this.cancelReconnect()
    this.cancelReconnectReset()
    this.pendingSamples = { microphone: [], system: [] }
    this.pendingSampleCounts = { microphone: 0, system: 0 }
    this.pendingSequences = { microphone: null, system: null }
    this.queue = []
    this.inFlight = []
    this.rejectEventWaiters(new Error(message))
    this.onTranscript(null)
    this.onWarning(message)
  }

  private enqueueFrame(frame: Uint8Array) {
    this.queue.push(frame)
    if (this.queue.length <= MAX_TRANSPORT_FRAMES) return
    this.queue.shift()
    this.onWarning("Transcription is falling behind; local recording is still complete.")
  }

  private drainQueue(force = false) {
    const socket = this.socket
    if (!this.providerReady || socket?.readyState !== 1) return
    while (
      this.queue.length > 0
      && (force || socket.bufferedAmount < 1_048_576)
    ) {
      const frame = this.queue.shift()!
      socket.send(frame)
      this.inFlight.push(frame)
      if (this.inFlight.length > MAX_TRANSPORT_FRAMES) this.inFlight.shift()
    }
  }

  private reconcileFrames(nextSequences: Partial<Record<MeetingCaptureSource, number>>) {
    const replay = [...this.inFlight, ...this.queue]
      .map((frame) => {
        const source = meetingAudioFrameSource(frame)
        return source
          ? trimQueuedMeetingAudioFrame(frame, nextSequences[source] ?? 0)
          : null
      })
      .filter((frame): frame is Uint8Array => frame !== null)
    this.inFlight = []
    this.queue = replay
    if (this.queue.length <= MAX_TRANSPORT_FRAMES) return
    this.queue.splice(0, this.queue.length - MAX_TRANSPORT_FRAMES)
    this.onWarning("Transcription replay exceeded its buffer; local recording is still complete.")
  }

  private waitForEvent(type: string, timeoutMs = 15_000) {
    const existing = this.eventWaiters.get(type)
    if (existing) {
      this.dependencies.clearTimeout(existing.timer)
      existing.reject(new Error(`Superseded waiting for ${type}`))
    }
    return new Promise<void>((resolve, reject) => {
      const timer = this.dependencies.setTimeout(() => {
        this.eventWaiters.delete(type)
        reject(new Error(`Timed out waiting for ${type}`))
      }, timeoutMs)
      this.eventWaiters.set(type, { reject, resolve, timer })
    })
  }

  private resolveEventWaiter(type: string) {
    const waiter = this.eventWaiters.get(type)
    if (!waiter) return
    this.eventWaiters.delete(type)
    this.dependencies.clearTimeout(waiter.timer)
    waiter.resolve()
  }

  private rejectEventWaiters(reason: Error) {
    for (const waiter of this.eventWaiters.values()) {
      this.dependencies.clearTimeout(waiter.timer)
      waiter.reject(reason)
    }
    this.eventWaiters.clear()
  }
}

function readNextMeetingAudioSequences(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const entries = Object.entries(value as Record<string, unknown>)
  const result: Partial<Record<MeetingCaptureSource, number>> = {}
  for (const [source, sequence] of entries) {
    if (
      (source !== "microphone" && source !== "system")
      || typeof sequence !== "number"
      || !Number.isSafeInteger(sequence)
      || sequence < 0
    ) return null
    result[source] = sequence
  }
  return entries.length > 0 ? result : null
}

export function trimQueuedMeetingAudioFrame(
  frame: Uint8Array,
  nextSequence: number,
) {
  if (
    frame.byteLength < 9 + FRAME_SAMPLES * 2
    || (frame.byteLength - 9) % (FRAME_SAMPLES * 2) !== 0
  ) return null
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  const sequenceValue = view.getBigUint64(0, true)
  if (sequenceValue > BigInt(Number.MAX_SAFE_INTEGER)) return null
  const sequence = Number(sequenceValue)
  const frameCount = (frame.byteLength - 9) / (FRAME_SAMPLES * 2)
  const endSequence = sequence + frameCount - 1
  if (endSequence < nextSequence) return null
  if (sequence >= nextSequence) return frame

  const skippedFrames = nextSequence - sequence
  const trimmed = new Uint8Array(
    9 + (frameCount - skippedFrames) * FRAME_SAMPLES * 2,
  )
  new DataView(trimmed.buffer).setBigUint64(0, BigInt(nextSequence), true)
  trimmed[8] = frame[8]
  trimmed.set(frame.subarray(9 + skippedFrames * FRAME_SAMPLES * 2), 9)
  return trimmed
}

function meetingAudioSourceCode(source: MeetingCaptureSource) {
  return source === "microphone" ? 0 : 1
}

function meetingAudioFrameSource(frame: Uint8Array): MeetingCaptureSource | null {
  if (frame.byteLength < 9) return null
  if (frame[8] === 0) return "microphone"
  if (frame[8] === 1) return "system"
  return null
}

function parseMeetingAudioEvent(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw) as unknown
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function parseTranscriptDelta(
  raw: string,
): Omit<MeetingTranscriptDraft, "meetingId"> | null | undefined {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (value.type !== "transcript.delta") return undefined
    if (
      typeof value.itemId !== "string"
      || (value.source !== "microphone" && value.source !== "system")
      || typeof value.startMs !== "number"
      || typeof value.text !== "string"
      || typeof value.updatedAt !== "number"
    ) return undefined
    return {
      itemId: value.itemId,
      source: value.source,
      startMs: value.startMs,
      text: value.text,
      updatedAt: value.updatedAt,
    }
  } catch {
    return undefined
  }
}
