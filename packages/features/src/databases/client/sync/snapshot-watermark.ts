/** A read may only replace a projection at or beyond its committed watermark. */
export class DatabaseSnapshotWatermark {
  private version = 0

  observe(version: number) {
    this.version = Math.max(this.version, version)
  }

  async read<T>(fetch: () => Promise<T>, versionOf: (value: T) => number) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const value = await fetch()
      const version = versionOf(value)
      if (version >= this.version) {
        this.observe(version)
        return value
      }
    }
    throw new Error("Database refresh is behind committed changes. Please retry.")
  }
}
