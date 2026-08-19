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
