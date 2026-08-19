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
} from "./meeting-capture-types"

const SAMPLE_RATE = 24_000
const FRAME_SAMPLES = 480
const RECOVERY_CHUNK_SAMPLES = SAMPLE_RATE * 5
const MAX_TRANSPORT_FRAMES = 1_500

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
    this.active.transport.pause()
    this.setStatus({ ...this.status, phase: "paused" })
    return this.status!
  }

  async resume() {
    if (!this.active || !this.status) throw new Error("No meeting capture is active.")
    this.active.captureStartedAt = performance.now()
    this.active.transport.resume()
    try {
      await this.active.audioContext.resume()
    } catch (error) {
      this.active.transport.pause()
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
    active.transport.stop()
    active.microphoneStream?.getTracks().forEach((track) => track.stop())
    active.displayStream?.getTracks().forEach((track) => track.stop())
    active.audioNodes.forEach((node) => node.disconnect())
    await active.audioContext.close()
    const elapsedMs = this.status.elapsedMs
    await finishBrowserMeetingRecovery(this.status.meetingId!, elapsedMs).catch(() => undefined)
    this.setStatus({ ...this.status, activeSources: [], phase: "stopped" })
    await this.loadRecovery(this.status.meetingId!)
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
    const microphone = active.activeSources.includes("microphone")
      ? active.queues.microphone.take(FRAME_SAMPLES)
      : new Float32Array(FRAME_SAMPLES)
    const system = active.activeSources.includes("system")
      ? active.queues.system.take(FRAME_SAMPLES)
      : new Float32Array(FRAME_SAMPLES)
    const mixed = mixSources(microphone, system, active.activeSources)
    active.transport.send(mixed)
    if (active.activeSources.includes("microphone")) {
      active.recovery.microphone.push(...floatToPcm(microphone))
      this.flushRecovery(active, "microphone")
    }
    if (active.activeSources.includes("system")) {
      active.recovery.system.push(...floatToPcm(system))
      this.flushRecovery(active, "system")
    }
    const peak = mixed.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0)
    const rms = Math.sqrt(mixed.reduce((value, sample) => value + sample * sample, 0) / mixed.length)
    this.level = Math.min(1, Math.max(peak, rms * 4))
    this.status = { ...status, elapsedMs: status.elapsedMs + 20 }
    this.emit()
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

type BrowserMeetingTransportState = "paused" | "recording" | "stopped"

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

export class BrowserMeetingTransport {
  private audioTicket: string
  private audioWebsocketUrl: string
  private readonly dependencies: BrowserMeetingTransportDependencies
  private readonly onWarning: (message: string) => void
  private queue: Uint8Array[] = []
  private reconnectAttempt = 0
  private reconnectTimer: number | null = null
  private sequence = 0
  private socket: WebSocket | null = null
  private state: BrowserMeetingTransportState = "stopped"

  constructor(
    url: string,
    ticket: string,
    onWarning: (message: string) => void,
    dependencies: BrowserMeetingTransportDependencies = defaultBrowserMeetingTransportDependencies,
  ) {
    this.audioWebsocketUrl = url
    this.audioTicket = ticket
    this.dependencies = dependencies
    this.onWarning = onWarning
  }

  start() {
    if (this.state !== "stopped") return
    this.state = "recording"
    this.connect()
  }

  pause() {
    if (this.state !== "recording") return
    this.state = "paused"
    this.cancelReconnect()
    this.closeSocket("Meeting paused")
  }

  resume() {
    if (this.state !== "paused") return
    this.state = "recording"
    this.connect()
  }

  refresh(url: string, ticket: string) {
    this.audioWebsocketUrl = url
    this.audioTicket = ticket
    if (this.state === "recording" && (!this.socket || this.socket.readyState >= 2)) {
      this.cancelReconnect()
      this.connect()
    }
  }

  send(samples: Float32Array) {
    if (this.state !== "recording") return
    const frame = new Uint8Array(8 + samples.length * 2)
    const view = new DataView(frame.buffer)
    view.setBigUint64(0, BigInt(this.sequence++), true)
    for (let index = 0; index < samples.length; index += 1) {
      view.setInt16(8 + index * 2, Math.round(
        Math.max(-1, Math.min(1, samples[index])) * 0x7fff,
      ), true)
    }
    if (this.socket?.readyState === 1 && this.socket.bufferedAmount < 1_048_576) {
      this.socket.send(frame)
      return
    }
    this.queue.push(frame)
    if (this.queue.length > MAX_TRANSPORT_FRAMES) {
      this.queue.shift()
      this.onWarning("Transcription is falling behind; local recording is still complete.")
    }
  }

  stop() {
    if (this.state === "stopped") return
    this.state = "stopped"
    this.cancelReconnect()
    this.closeSocket("Meeting stopped")
  }

  private connect() {
    if (this.state !== "recording") return
    if (this.socket && this.socket.readyState < 2) return
    const url = this.dependencies.resolveUrl(this.audioWebsocketUrl)
    const socket = this.dependencies.createSocket(url.toString(), [
      "zilobase.meeting-audio.v1",
      `zilobase.meeting-audio.auth.${this.audioTicket}`,
    ])
    socket.binaryType = "arraybuffer"
    socket.onopen = () => {
      if (this.socket !== socket || this.state !== "recording") {
        socket.close(1000, "Meeting capture inactive")
        return
      }
      this.reconnectAttempt = 0
      while (this.queue.length && socket.bufferedAmount < 1_048_576) {
        socket.send(this.queue.shift()!)
      }
    }
    socket.onclose = () => {
      if (this.socket !== socket) return
      this.socket = null
      if (this.state !== "recording") return
      const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempt++)
      this.reconnectTimer = this.dependencies.setTimeout(() => {
        this.reconnectTimer = null
        this.connect()
      }, delay)
    }
    socket.onerror = () => {
      if (this.socket !== socket || this.state !== "recording") return
      this.onWarning("Meeting transcription disconnected; local recording continues.")
      socket.close()
    }
    this.socket = socket
  }

  private cancelReconnect() {
    if (this.reconnectTimer === null) return
    this.dependencies.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private closeSocket(reason: string) {
    const socket = this.socket
    this.socket = null
    if (socket && socket.readyState < 2) socket.close(1000, reason)
  }
}
