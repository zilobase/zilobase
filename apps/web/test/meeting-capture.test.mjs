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

  test("browser meeting transport pauses and resumes on the existing socket", async () => {
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
    sockets[0].open()
    sockets[0].message(JSON.stringify({
      nextSequences: { microphone: 0 },
      type: "meeting.ready",
    }))
    transport.send(new Float32Array(480).fill(0.25))
    const paused = transport.pause()
    assert.equal(
      JSON.parse(sockets[0].sent.at(-1)).type,
      "recording.pause",
    )
    sockets[0].message(JSON.stringify({ type: "recording.paused" }))
    await paused
    assert.equal(sockets[0].closeReason, null)
    assert.equal(timers.size, 0)

    transport.refresh("/meeting-audio?meeting=one", "ticket-two")
    assert.equal(sockets.length, 1)
    const resumed = transport.resume()
    assert.equal(sockets.length, 1)
    assert.equal(JSON.parse(sockets[0].sent.at(-1)).type, "recording.resume")
    sockets[0].message(JSON.stringify({
      nextSequences: { microphone: 1 },
      type: "meeting.ready",
    }))
    await resumed
    const binaryBefore = sockets[0].sent.filter((value) => value instanceof Uint8Array)
    assert.equal(binaryBefore.length, 1)
    assert.equal(new DataView(binaryBefore[0].buffer).getBigUint64(0, true), 0n)

    for (let index = 0; index < 5; index += 1) {
      transport.send(new Float32Array(480).fill(0.5))
    }
    const binaryAfter = sockets[0].sent.filter((value) => value instanceof Uint8Array)
    assert.equal(new DataView(binaryAfter[1].buffer).getBigUint64(0, true), 1n)
    assert.equal(binaryAfter[1].byteLength, 9 + 480 * 2 * 5)
  })

  test("browser meeting transport reports live transcript deltas", async () => {
    const { BrowserMeetingTransport } = await loadModule(
      "/src/editor/extensions/meeting/browser-meeting-capture.ts",
    )
    const sockets = []
    const deltas = []
    const transport = new BrowserMeetingTransport(
      "/meeting-audio",
      "ticket",
      () => undefined,
      {
        clearTimeout() {},
        createSocket(url, protocols) {
          const socket = createFakeSocket(url, protocols)
          sockets.push(socket)
          return socket
        },
        resolveUrl: (url) => new URL(url, "https://zilobase.test"),
        setTimeout: () => 1,
      },
      (delta) => deltas.push(delta),
    )

    transport.start()
    sockets[0].open()
    sockets[0].message(JSON.stringify({
      itemId: "item-1",
      source: "microphone",
      startMs: 200,
      text: "Hello",
      type: "transcript.delta",
      updatedAt: 123,
    }))
    sockets[0].message(JSON.stringify({
      itemId: "item-1",
      source: "microphone",
      startMs: 200,
      text: "",
      type: "transcript.delta",
      updatedAt: 124,
    }))

    assert.deepEqual(deltas, [{
      itemId: "item-1",
      source: "microphone",
      startMs: 200,
      text: "Hello",
      updatedAt: 123,
    }, {
      itemId: "item-1",
      source: "microphone",
      startMs: 200,
      text: "",
      updatedAt: 124,
    }])
  })

  test("browser meeting transport keeps microphone and system audio in parallel lanes", async () => {
    const { BrowserMeetingTransport } = await loadModule(
      "/src/editor/extensions/meeting/browser-meeting-capture.ts",
    )
    const sockets = []
    const transport = new BrowserMeetingTransport(
      "/meeting-audio",
      "ticket",
      () => undefined,
      {
        clearTimeout() {},
        createSocket(url, protocols) {
          const socket = createFakeSocket(url, protocols)
          sockets.push(socket)
          return socket
        },
        resolveUrl: (url) => new URL(url, "https://zilobase.test"),
        setTimeout: () => 1,
      },
      () => undefined,
      ["microphone", "system"],
    )

    transport.start()
    sockets[0].open()
    assert.deepEqual(JSON.parse(sockets[0].sent[0]), {
      sources: ["microphone", "system"],
      type: "recording.configure",
    })
    sockets[0].message(JSON.stringify({
      nextSequences: { microphone: 0, system: 0 },
      type: "meeting.ready",
    }))
    for (let index = 0; index < 5; index += 1) {
      transport.send(new Float32Array(480).fill(0.25), "microphone")
      transport.send(new Float32Array(480).fill(0.75), "system")
    }

    const packets = sockets[0].sent.filter((value) => value instanceof Uint8Array)
    assert.equal(packets.length, 2)
    assert.equal(packets[0][8], 0)
    assert.equal(packets[1][8], 1)
    assert.equal(new DataView(packets[0].buffer).getBigUint64(0, true), 0n)
    assert.equal(new DataView(packets[1].buffer).getBigUint64(0, true), 0n)
  })

  test("browser meeting transport replays only audio the server has not acknowledged", async () => {
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
        timers.set(timer, callback)
        return timer
      },
    })

    transport.start()
    sockets[0].open()
    sockets[0].message(JSON.stringify({
      nextSequences: { microphone: 0 },
      type: "meeting.ready",
    }))
    for (let index = 0; index < 5; index += 1) {
      transport.send(new Float32Array(480).fill(0.25))
    }
    assert.equal(sockets[0].sent.filter((value) => value instanceof Uint8Array).length, 1)

    sockets[0].disconnect()
    for (let index = 0; index < 5; index += 1) {
      transport.send(new Float32Array(480).fill(0.5))
    }
    const reconnect = [...timers.values()][0]
    timers.clear()
    reconnect()
    sockets[1].open()
    sockets[1].message(JSON.stringify({
      nextSequences: { microphone: 3 },
      type: "meeting.ready",
    }))

    const replayed = sockets[1].sent.filter((value) => value instanceof Uint8Array)
    assert.equal(replayed.length, 2)
    assert.equal(new DataView(replayed[0].buffer).getBigUint64(0, true), 3n)
    assert.equal(replayed[0].byteLength, 9 + 480 * 2 * 2)
    assert.equal(new DataView(replayed[1].buffer).getBigUint64(0, true), 5n)
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
    const stopped = transport.stop(0)
    assert.equal(sockets.length, 3)
    sockets[2].open()
    sockets[2].message(JSON.stringify({ type: "meeting.ready" }))
    await Promise.resolve()
    assert.equal(JSON.parse(sockets[2].sent.at(-1)).type, "recording.stop")
    sockets[2].message(JSON.stringify({ type: "recording.flush.completed" }))
    await stopped
    assert.equal(timers.size, 0)
  })

  test("browser meeting transport does not retry permanent provider configuration failures", async () => {
    const { BrowserMeetingTransport } = await loadModule(
      "/src/editor/extensions/meeting/browser-meeting-capture.ts",
    )
    const sockets = []
    const timers = new Map()
    const warnings = []
    const transport = new BrowserMeetingTransport("/meeting-audio", "ticket", (warning) => {
      warnings.push(warning)
    }, {
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
        timers.set(1, callback)
        return 1
      },
    })

    transport.start()
    sockets[0].disconnect(4400, "Meeting transcription failed")

    assert.equal(timers.size, 0)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /could not start/i)

    await transport.stop(1_000)
    assert.equal(sockets.length, 1)
  })

  test("browser meeting transport bounds repeated transient reconnects", async () => {
    const { BrowserMeetingTransport } = await loadModule(
      "/src/editor/extensions/meeting/browser-meeting-capture.ts",
    )
    const sockets = []
    const timers = new Map()
    const warnings = []
    let nextTimer = 1
    const transport = new BrowserMeetingTransport("/meeting-audio", "ticket", (warning) => {
      warnings.push(warning)
    }, {
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
        timers.set(timer, callback)
        return timer
      },
    })

    transport.start()
    for (let attempt = 0; attempt < 6; attempt += 1) {
      sockets.at(-1).disconnect()
      assert.equal(timers.size, 1)
      const reconnect = [...timers.values()][0]
      timers.clear()
      reconnect()
    }
    sockets.at(-1).disconnect()

    assert.equal(sockets.length, 7)
    assert.equal(timers.size, 0)
    assert.match(warnings.at(-1), /repeated reconnects/i)
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

  test("meeting transcript text export strips Yjs XML markup", async () => {
    const Y = await import("yjs")
    const { meetingTranscriptPlainText } = await loadModule(
      "/src/editor/extensions/meeting/meeting-transcript-text.ts",
    )
    const document = new Y.Doc()
    const firstParagraph = new Y.XmlElement("paragraph")
    const firstText = new Y.XmlText()
    firstText.insert(0, "[0:05] Hello")
    firstParagraph.insert(0, [firstText])
    const secondParagraph = new Y.XmlElement("paragraph")
    const secondText = new Y.XmlText()
    secondText.insert(0, "[0:10] Team")
    secondParagraph.insert(0, [secondText])
    document.getXmlFragment("transcript").push([
      firstParagraph,
      secondParagraph,
    ])

    assert.equal(
      meetingTranscriptPlainText(document),
      "[0:05] Hello\n\n[0:10] Team",
    )
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
    onmessage: null,
    protocols,
    readyState: 0,
    sent: [],
    url,
    close(code, reason) {
      this.closeCode = code ?? null
      this.closeReason = reason ?? null
      this.readyState = 3
      this.onclose?.({ code: code ?? 1000, reason: reason ?? "" })
    },
    disconnect(code = 1006, reason = "") {
      this.readyState = 3
      this.onclose?.({ code, reason })
    },
    open() {
      this.readyState = 1
      this.onopen?.()
    },
    message(data) {
      this.onmessage?.({ data })
    },
    send(message) {
      this.sent.push(message)
    },
  }
}
