import { zipSync } from "fflate"

export function register({ assert, loadModule, test }) {
  test("recovery manifests reject malformed paths, checksums, and duplicate pages", async () => {
    const { validateRecoveryManifest } = await loadModule("/src/features/offline/documents/offline-recovery.ts")
    const page = {
      checksum: "a".repeat(64),
      exportedAt: "2026-01-01T00:00:00.000Z",
      file: "pages/page-1.yjs",
      name: "Page",
      pageId: "page-1",
      workspaceId: "workspace-1",
    }
    const manifest = {
      accountId: "account-1",
      apiOrigin: "https://api.zilobase.test",
      exportedAt: "2026-01-01T00:00:00.000Z",
      pages: [page],
      schemaVersion: 1,
    }
    assert.equal(validateRecoveryManifest(manifest).pages.length, 1)
    assert.throws(() => validateRecoveryManifest({ ...manifest, schemaVersion: 2 }))
    assert.throws(() => validateRecoveryManifest({ ...manifest, pages: [{ ...page, file: "../token" }] }))
    assert.throws(() => validateRecoveryManifest({ ...manifest, pages: [{ ...page, checksum: "bad" }] }))
    assert.throws(() => validateRecoveryManifest({ ...manifest, pages: [page, page] }))
  })

  test("recovery archives reject unsafe paths and oversized page updates", async () => {
    const { extractRecoveryArchive } = await loadModule("/src/features/offline/documents/offline-recovery.ts")
    assert.throws(() =>
      extractRecoveryArchive(
        zipSync({ "../token": new Uint8Array([1]), "manifest.json": new Uint8Array([123, 125]) }),
      ),
    )
    assert.throws(() =>
      extractRecoveryArchive(
        zipSync({
          "manifest.json": new Uint8Array([123, 125]),
          "pages/large.yjs": new Uint8Array(25 * 1024 * 1024 + 1),
        }),
      ),
    )
  })
}
