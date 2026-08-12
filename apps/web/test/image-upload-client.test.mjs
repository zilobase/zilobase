export function register({ assert, loadModule, test }) {
  test("image upload client uses S3 PUT without app credentials", async () => {
    const { uploadPageImage } = await loadModule("/src/lib/image-upload.ts")
    const calls = mockFetch([
      jsonResponse({
        asset: createAsset("asset-s3"),
        upload: {
          expiresAt: "2026-06-17T01:00:00.000Z",
          headers: { "Content-Type": "image/png" },
          method: "PUT",
          storageMode: "s3",
          url: "https://objects.example/upload",
        },
      }),
      new Response(null, { status: 200 }),
      jsonResponse({ asset: createAsset("asset-s3", "uploaded") }),
    ])

    try {
      const result = await uploadPageImage({
        file: createImageFile(),
        workspaceId: "org-1",
        pageId: "page-1",
      })

      assert.equal(result.url, "https://api.zilobase.test/images/asset-s3")
      assert.equal(calls[1].url, "https://objects.example/upload")
      assert.equal(calls[1].init.credentials, "omit")
      assert.equal(calls[1].headers.get("content-type"), "image/png")
      assert.equal(calls[1].headers.has("x-mobile-auth-cookie"), false)
    } finally {
      restoreFetch()
    }
  })

  test("image upload client uses app auth headers for binding uploads", async () => {
    const { uploadPageImage } = await loadModule("/src/lib/image-upload.ts")
    const previousWindow = globalThis.window
    globalThis.window = {
      __ZILOBASE_MOBILE_AUTH_COOKIE__: "session=mobile",
    }
    const calls = mockFetch([
      jsonResponse({
        asset: createAsset("asset-binding"),
        upload: {
          expiresAt: "2026-06-17T01:00:00.000Z",
          headers: { "Content-Type": "image/png" },
          method: "PUT",
          storageMode: "binding",
          url: "http://api.zilobase.com/images/uploads/asset-binding/body",
        },
      }),
      new Response(null, { status: 200 }),
      jsonResponse({ asset: createAsset("asset-binding", "uploaded") }),
    ])

    try {
      const result = await uploadPageImage({
        databaseId: "database-1",
        file: createImageFile(),
        workspaceId: "org-1",
        pageId: "page-1",
      })

      assert.equal(result.url, "https://api.zilobase.test/images/asset-binding")
      assert.equal(
        calls[1].url,
        "https://api.zilobase.test/images/uploads/asset-binding/body",
      )
      assert.equal(calls[1].init.credentials, "include")
      assert.equal(calls[1].headers.get("x-mobile-auth-cookie"), "session=mobile")
    } finally {
      globalThis.window = previousWindow
      restoreFetch()
    }
  })

  test("profile image uploads complete and resolve account image URLs", async () => {
    const { getUserImageUrl, uploadProfileImage } = await loadModule(
      "/src/lib/image-upload.ts",
    )
    const imagePath = "/user-settings/profile/images/user-1/image-1/avatar.png"
    const calls = mockFetch([
      jsonResponse({
        image: {
          byteSize: 4,
          contentType: "image/png",
          filename: "avatar.png",
          id: "image-1",
        },
        upload: {
          expiresAt: "2026-06-17T01:00:00.000Z",
          headers: { "Content-Type": "image/png" },
          method: "PUT",
          storageMode: "s3",
          url: "https://objects.example/profile-upload",
        },
      }),
      new Response(null, { status: 200 }),
      jsonResponse({ image: imagePath }),
    ])

    try {
      assert.deepEqual(await uploadProfileImage(createImageFile()), {
        image: imagePath,
      })
      assert.equal(
        calls[0].url,
        "https://api.zilobase.test/user-settings/profile/image/uploads",
      )
      assert.equal(calls[1].url, "https://objects.example/profile-upload")
      assert.equal(
        calls[2].url,
        "https://api.zilobase.test/user-settings/profile/image/uploads/image-1/complete",
      )
      assert.equal(
        getUserImageUrl(imagePath),
        `https://api.zilobase.test${imagePath}`,
      )
      assert.equal(
        getUserImageUrl("https://images.example/avatar.png"),
        "https://images.example/avatar.png",
      )
    } finally {
      restoreFetch()
    }
  })
}

const originalFetch = globalThis.fetch

function mockFetch(responses) {
  const calls = []

  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      headers: new Headers(init.headers),
      init,
      url: String(url),
    })

    const response = responses.shift()

    if (!response) {
      throw new Error(`Unexpected fetch call to ${String(url)}`)
    }

    return response
  }

  return calls
}

function restoreFetch() {
  globalThis.fetch = originalFetch
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  })
}

function createAsset(id, status = "pending") {
  return {
    byteSize: 4,
    contentType: "image/png",
    filename: "image.png",
    id,
    status,
  }
}

function createImageFile() {
  return new File([new Uint8Array([1, 2, 3, 4])], "image.png", {
    type: "image/png",
  })
}
