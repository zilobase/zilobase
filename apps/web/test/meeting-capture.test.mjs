export function register({ assert, loadModule, test }) {
  test("meeting capture mixes synchronized sources without changing frame length", async () => {
    const { mixSources } = await loadModule(
      "/src/editor/extensions/meeting/browser-meeting-capture.ts",
    )
    const microphone = new Float32Array(480).fill(0.5)
    const system = new Float32Array(480).fill(0.25)
    const mixed = mixSources(microphone, system, ["microphone", "system"])

    assert.equal(mixed.length, 480)
    assert.ok(Math.abs(mixed[0] - Math.tanh(0.375)) < 0.000_001)
  })

  test("browser streaming resampler preserves state across callback chunks", async () => {
    const { StreamingResampler } = await loadModule(
      "/src/editor/extensions/meeting/browser-meeting-capture.ts",
    )
    const resampler = new StreamingResampler(48_000, 24_000)
    const first = resampler.process(new Float32Array(241).fill(0.25))
    const second = resampler.process(new Float32Array(239).fill(0.25))

    assert.equal(first.length + second.length, 240)
  })

  test("browser meeting transport stays disconnected while paused and resumes once", async () => {
    const { BrowserMeetingTransport } = await loadModule(
      "/src/editor/extensions/meeting/browser-meeting-capture.ts",
    )
    const sockets = []
    const timers = new Map()
    let nextTimer = 1
    const dependencies = {
      clearTimeout(timer) {
        timers.delete(timer)
      },
      createSocket(url, protocols) {
        const socket = createFakeSocket(url, protocols)
        sockets.push(socket)
        return socket
      },
      resolveUrl: (url) => new URL(url, "https://zilobase.test"),
      setTimeout(callback) {
        const timer = nextTimer++
        timers.set(timer, () => {
          timers.delete(timer)
          callback()
        })
        return timer
      },
    }
    const transport = new BrowserMeetingTransport(
      "/meeting-audio?meeting=one",
      "ticket-one",
      () => undefined,
      dependencies,
    )

    transport.start()
    assert.equal(sockets.length, 1)
    transport.send(new Float32Array(480).fill(0.25))
    transport.pause()
    assert.equal(sockets[0].closeReason, "Meeting paused")
    assert.equal(timers.size, 0)

    transport.refresh("/meeting-audio?meeting=one", "ticket-two")
    assert.equal(sockets.length, 1)
    transport.resume()
    assert.equal(sockets.length, 2)
    assert.ok(sockets[1].protocols.includes("zilobase.meeting-audio.auth.ticket-two"))
    sockets[1].open()
    assert.equal(sockets[1].sent.length, 1)
    assert.equal(new DataView(sockets[1].sent[0].buffer).getBigUint64(0, true), 0n)

    transport.send(new Float32Array(480).fill(0.5))
    assert.equal(new DataView(sockets[1].sent[1].buffer).getBigUint64(0, true), 1n)
  })

  test("browser meeting transport reconnects only while recording", async () => {
    const { BrowserMeetingTransport } = await loadModule(
      "/src/editor/extensions/meeting/browser-meeting-capture.ts",
    )
    const sockets = []
    const timers = new Map()
    let nextTimer = 1
    const transport = new BrowserMeetingTransport("/meeting-audio", "ticket", () => undefined, {
      clearTimeout(timer) {
        timers.delete(timer)
      },
      createSocket(url, protocols) {
        const socket = createFakeSocket(url, protocols)
        sockets.push(socket)
        return socket
      },
      resolveUrl: (url) => new URL(url, "https://zilobase.test"),
      setTimeout(callback) {
        const timer = nextTimer++
        timers.set(timer, () => {
          timers.delete(timer)
          callback()
        })
        return timer
      },
    })

    transport.start()
    sockets[0].disconnect()
    assert.equal(timers.size, 1)
    const reconnect = [...timers.values()][0]
    reconnect()
    assert.equal(sockets.length, 2)

    sockets[1].disconnect()
    assert.equal(timers.size, 1)
    transport.stop()
    assert.equal(timers.size, 0)
  })

  test("browser recovery exports separate microphone and system channels", async () => {
    const { createRecoveryWav } = await loadModule(
      "/src/editor/extensions/meeting/browser-meeting-recovery.ts",
    )
    const wav = createRecoveryWav(
      Int16Array.from([100, 200]),
      Int16Array.from([-100, -200]),
    )
    const view = new DataView(wav.buffer)

    assert.equal(view.getUint16(22, true), 2)
    assert.equal(view.getUint32(24, true), 24_000)
    assert.equal(view.getInt16(44, true), 100)
    assert.equal(view.getInt16(46, true), -100)
  })
}

function createFakeSocket(url, protocols) {
  return {
    binaryType: "blob",
    bufferedAmount: 0,
    closeCode: null,
    closeReason: null,
    onclose: null,
    onerror: null,
    onopen: null,
    protocols,
    readyState: 0,
    sent: [],
    url,
    close(code, reason) {
      this.closeCode = code ?? null
      this.closeReason = reason ?? null
      this.readyState = 3
      this.onclose?.()
    },
    disconnect() {
      this.readyState = 3
      this.onclose?.()
    },
    open() {
      this.readyState = 1
      this.onopen?.()
    },
    send(message) {
      this.sent.push(message)
    },
  }
}
