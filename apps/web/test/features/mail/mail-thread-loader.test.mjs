export function register({ assert, loadModule, test }) {
  test("mail thread loading coalesces concurrent intent and foreground requests", async () => {
    const { loadMailThreadOnce } = await loadModule("/src/features/mail/model/mail-thread-loader.ts")
    const inFlight = new Map()
    let loads = 0
    let finish
    const load = () => {
      loads += 1
      return new Promise((resolve) => { finish = resolve })
    }

    const first = loadMailThreadOnce(inFlight, "mail-db:thread-1", load)
    const second = loadMailThreadOnce(inFlight, "mail-db:thread-1", load)
    assert.equal(first, second)
    assert.equal(loads, 1)

    finish()
    await first
    assert.equal(inFlight.size, 0)

    await loadMailThreadOnce(inFlight, "mail-db:thread-1", async () => { loads += 1 })
    assert.equal(loads, 2)
  })
}
