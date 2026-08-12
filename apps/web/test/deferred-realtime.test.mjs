import * as Y from "yjs"

export function register({ assert, loadModule, test }) {
  test("realtime starts only after the page has painted", async () => {
    const { scheduleRealtimeAfterPagePaint } = await loadModule(
      "/src/lib/deferred-realtime.ts",
    )
    const frames = new Map()
    const timeouts = new Map()
    let nextId = 1
    let starts = 0
    const scheduler = {
      cancelAnimationFrame: (id) => frames.delete(id),
      clearTimeout: (id) => timeouts.delete(id),
      requestAnimationFrame: (callback) => {
        const id = nextId++
        frames.set(id, callback)
        return id
      },
      setTimeout: (callback) => {
        const id = nextId++
        timeouts.set(id, callback)
        return id
      },
    }

    scheduleRealtimeAfterPagePaint(() => {
      starts += 1
    }, scheduler)

    assert.equal(starts, 0)
    frames.values().next().value(0)
    assert.equal(starts, 0)
    timeouts.values().next().value()
    assert.equal(starts, 1)
  })

  test("cancelled realtime work never starts", async () => {
    const { scheduleRealtimeAfterPagePaint } = await loadModule(
      "/src/lib/deferred-realtime.ts",
    )
    const frames = new Map()
    let starts = 0
    const scheduler = {
      cancelAnimationFrame: (id) => frames.delete(id),
      clearTimeout: () => undefined,
      requestAnimationFrame: (callback) => {
        frames.set(1, callback)
        return 1
      },
      setTimeout: () => 2,
    }

    const cancel = scheduleRealtimeAfterPagePaint(() => {
      starts += 1
    }, scheduler)
    cancel()

    assert.equal(frames.size, 0)
    assert.equal(starts, 0)
  })

  test("page collaboration providers can mount before opening a socket", async () => {
    const { connectLocalPageDocument } = await loadModule(
      "/src/lib/offline-documents.ts",
    )
    const document = new Y.Doc()
    const provider = connectLocalPageDocument({
      autoConnect: false,
      document,
      pageId: "page-1",
      ticket: {
        documentName: "page.page-1",
        expiresAt: "2030-01-01T00:00:00.000Z",
        initialState: "",
        token: "ticket",
        websocketUrl: "wss://api.zilobase.test/collaboration",
      },
    })

    assert.equal(provider.configuration.websocketProvider.shouldConnect, false)
    provider.destroy()
    document.destroy()
  })
}
