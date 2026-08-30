export function register({ assert, loadModule, test }) {
  test("mail realtime deduplicates a revision across tabs", async () => {
    const { coordinateMailRevision } = await loadModule(
      "/src/features/mail/model/mail-realtime.ts",
    )
    const values = new Map()
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    }
    const locks = new TestLocks()
    let synchronizations = 0
    const synchronize = async () => {
      synchronizations += 1
      await Promise.resolve()
    }

    const results = await Promise.all([
      coordinateMailRevision({ connectionId: "connection-1", locks, revision: 3, storage, synchronize }),
      coordinateMailRevision({ connectionId: "connection-1", locks, revision: 3, storage, synchronize }),
    ])

    assert.equal(synchronizations, 1)
    assert.deepEqual(results.sort(), [false, true])
    assert.equal(values.get("zilobase:mail:revision:connection-1"), "3")
  })

  test("mail realtime recovery uses the same cross-tab sync lock", async () => {
    const { coordinateMailRecovery } = await loadModule(
      "/src/features/mail/model/mail-realtime.ts",
    )
    const locks = new TestLocks()
    let synchronizations = 0
    const synchronize = async () => {
      synchronizations += 1
      await Promise.resolve()
    }

    const results = await Promise.all([
      coordinateMailRecovery({ connectionId: "connection-1", locks, synchronize }),
      coordinateMailRecovery({ connectionId: "connection-1", locks, synchronize }),
    ])
    assert.equal(synchronizations, 1)
    assert.deepEqual(results.sort(), [false, true])
  })

  test("mail realtime does not acknowledge a revision after a failed sync", async () => {
    const { coordinateMailRevision } = await loadModule(
      "/src/features/mail/model/mail-realtime.ts",
    )
    const values = new Map()
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    }
    const synchronized = await coordinateMailRevision({
      connectionId: "connection-1",
      locks: null,
      revision: 4,
      storage,
      synchronize: async () => null,
    })

    assert.equal(synchronized, false)
    assert.equal(values.size, 0)
  })

  test("mail realtime reconnect uses bounded exponential backoff", async () => {
    const { mailReconnectDelay } = await loadModule(
      "/src/features/mail/model/mail-realtime.ts",
    )
    assert.deepEqual(
      [0, 1, 2, 5, 20].map(mailReconnectDelay),
      [1_000, 2_000, 4_000, 30_000, 30_000],
    )
  })
}

class TestLocks {
  busy = false

  async request(_name, _options, callback) {
    if (this.busy) return callback(null)
    this.busy = true
    try {
      return await callback({ name: "mail-sync" })
    } finally {
      this.busy = false
    }
  }
}
