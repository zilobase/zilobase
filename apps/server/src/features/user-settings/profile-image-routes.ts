import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { getStringEnv } from "../../shared/config/config";
import { db } from "../../infrastructure/database";
import { user } from "../../infrastructure/database/schema";
import {
  createImageStorage,
  resolveImageStorageMode,
  type ImageStorage,
} from "../../infrastructure/storage/image-storage";
import type { AppBindings } from "../../shared/types";

export const profileImageRoutes = new Hono<AppBindings>();

const defaultMaxProfileImageBytes = 5 * 1024 * 1024;
const defaultUploadUrlTtlSeconds = 10 * 60;
const allowedProfileImageContentTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type ProfileImageBody = {
  byteSize?: unknown;
  contentType?: unknown;
  filename?: unknown;
};

profileImageRoutes.post("/image/uploads", async (c) => {
  const currentUser = c.get("user");

  if (!currentUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const input = await readProfileImageBody(
    c.req.raw,
    getProfileImageMaxBytes(c.env),
  );

  if ("error" in input) {
    return c.json({ error: input.error }, 400);
  }

  const imageId = crypto.randomUUID();
  const objectKey = getProfileImageObjectKey({
    filename: input.filename,
    imageId,
    userId: currentUser.id,
  });
  const storageMode = resolveImageStorageMode(c.env);
  const storage = createImageStorage(c.env);
  const upload = storageMode === "s3"
    ? await storage.createUploadUrl({
        byteSize: input.byteSize,
        contentType: input.contentType,
        expiresInSeconds: getUploadUrlTtlSeconds(c.env),
        objectKey,
      })
    : {
        expiresAt: new Date(
          Date.now() + getUploadUrlTtlSeconds(c.env) * 1000,
        ).toISOString(),
        headers: { "Content-Type": input.contentType },
        method: "PUT" as const,
        storageMode,
        url: [
          `/user-settings/profile/image/uploads/${imageId}/body`,
          `?filename=${encodeURIComponent(input.filename)}`,
        ].join(""),
      };

  return c.json({
    image: {
      byteSize: input.byteSize,
      contentType: input.contentType,
      filename: input.filename,
      id: imageId,
    },
    upload,
  });
});

profileImageRoutes.put("/image/uploads/:imageId/body", async (c) => {
  const currentUser = c.get("user");

  if (!currentUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (resolveImageStorageMode(c.env) !== "binding") {
    return c.json(
      { error: "Server upload route is only available in binding mode" },
      409,
    );
  }

  const imageId = c.req.param("imageId");
  const filename = sanitizeFilename(c.req.query("filename") ?? "image");
  const contentType = normalizeContentType(c.req.header("content-type"));
  const contentLength = readPositiveInteger(c.req.header("content-length"));

  if (!isUuid(imageId)) {
    return c.json({ error: "Invalid profile image id" }, 400);
  }

  if (!contentType || !allowedProfileImageContentTypes.has(contentType)) {
    return c.json({ error: "A supported image content type is required" }, 400);
  }

  if (contentLength && contentLength > getProfileImageMaxBytes(c.env)) {
    return c.json({ error: "Profile image is too large" }, 413);
  }

  if (!c.req.raw.body) {
    return c.json({ error: "Image body is required" }, 400);
  }

  await createImageStorage(c.env).putObject({
    body: c.req.raw.body,
    contentType,
    objectKey: getProfileImageObjectKey({
      filename,
      imageId,
      userId: currentUser.id,
    }),
  });

  return c.json({ ok: true });
});

profileImageRoutes.post("/image/uploads/:imageId/complete", async (c) => {
  const currentUser = c.get("user");

  if (!currentUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const imageId = c.req.param("imageId");

  if (!isUuid(imageId)) {
    return c.json({ error: "Invalid profile image id" }, 400);
  }

  const input = await readProfileImageBody(
    c.req.raw,
    getProfileImageMaxBytes(c.env),
  );

  if ("error" in input) {
    return c.json({ error: input.error }, 400);
  }

  const storage = createImageStorage(c.env);
  const objectKey = getProfileImageObjectKey({
    filename: input.filename,
    imageId,
    userId: currentUser.id,
  });
  const object = await storage.head(objectKey);

  if (!object) {
    return c.json({ error: "Uploaded profile image was not found" }, 409);
  }

  if (
    object.byteSize !== undefined &&
    (object.byteSize > input.byteSize ||
      object.byteSize > getProfileImageMaxBytes(c.env))
  ) {
    await storage.delete(objectKey).catch(() => undefined);
    return c.json({ error: "Profile image is too large" }, 413);
  }

  if (
    object.contentType &&
    normalizeContentType(object.contentType) !== input.contentType
  ) {
    await storage.delete(objectKey).catch(() => undefined);
    return c.json({ error: "Uploaded profile image type does not match" }, 415);
  }

  const image = getProfileImagePath({
    filename: input.filename,
    imageId,
    userId: currentUser.id,
  });

  await db
    .update(user)
    .set({ image, updatedAt: new Date() })
    .where(eq(user.id, currentUser.id));

  await deletePreviousProfileImage(
    storage,
    currentUser.image,
    currentUser.id,
    objectKey,
  );

  return c.json({ image });
});

profileImageRoutes.delete("/image", async (c) => {
  const currentUser = c.get("user");

  if (!currentUser) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const previousObjectKey = getOwnedProfileImageObjectKey(
    currentUser.image,
    currentUser.id,
  );

  await db
    .update(user)
    .set({ image: null, updatedAt: new Date() })
    .where(eq(user.id, currentUser.id));

  if (previousObjectKey) {
    await deleteProfileImageObject(
      createImageStorage(c.env),
      previousObjectKey,
    );
  }

  return c.json({ image: null });
});

profileImageRoutes.get("/images/:userId/:imageId/:filename", async (c) => {
  if (!c.get("user")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = c.req.param("userId");
  const imageId = c.req.param("imageId");
  const filename = sanitizeFilename(c.req.param("filename"));

  if (!isUuid(imageId)) {
    return c.json({ error: "Profile image not found" }, 404);
  }

  const imagePath = getProfileImagePath({ filename, imageId, userId });
  const [owner] = await db
    .select({ image: user.image })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!owner || owner.image !== imagePath) {
    return c.json({ error: "Profile image not found" }, 404);
  }

  const object = await createImageStorage(c.env).get(
    getProfileImageObjectKey({ filename, imageId, userId }),
  );

  if (!object) {
    return c.json({ error: "Profile image not found" }, 404);
  }

  const headers = new Headers({
    "cache-control": "private, max-age=300",
    "content-type": object.contentType ?? "application/octet-stream",
  });

  if (object.byteSize !== undefined) {
    headers.set("content-length", String(object.byteSize));
  }

  return new Response(object.body, { headers });
});

async function readProfileImageBody(
  request: Request,
  maxBytes: number,
): Promise<
  | { byteSize: number; contentType: string; filename: string }
  | { error: string }
> {
  const body = await request.json().catch(() => null) as ProfileImageBody | null;
  const byteSize = readPositiveInteger(body?.byteSize);
  const contentType = normalizeContentType(readString(body?.contentType));
  const filename = sanitizeFilename(readString(body?.filename) ?? "image");

  if (!contentType || !allowedProfileImageContentTypes.has(contentType)) {
    return { error: "A supported image content type is required" };
  }

  if (!byteSize || byteSize > maxBytes) {
    return {
      error: `Profile image must be between 1 byte and ${maxBytes} bytes`,
    };
  }

  return { byteSize, contentType, filename };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readPositiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeContentType(value: string | undefined) {
  return value?.split(";")[0]?.trim().toLowerCase();
}

function sanitizeFilename(value: string) {
  const basename = value.split(/[\\/]/).pop() ?? "image";
  const safe = basename
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return safe || "image";
}

function getProfileImageMaxBytes(env: AppBindings["Bindings"]) {
  const configured = readPositiveInteger(
    getStringEnv(env, "IMAGE_UPLOAD_MAX_BYTES"),
  );

  return configured
    ? Math.min(configured, defaultMaxProfileImageBytes)
    : defaultMaxProfileImageBytes;
}

function getUploadUrlTtlSeconds(env: AppBindings["Bindings"]) {
  return readPositiveInteger(getStringEnv(env, "IMAGE_UPLOAD_URL_TTL_SECONDS")) ??
    defaultUploadUrlTtlSeconds;
}

function getProfileImagePath(options: {
  filename: string;
  imageId: string;
  userId: string;
}) {
  return [
    "/user-settings/profile/images",
    encodeURIComponent(options.userId),
    encodeURIComponent(options.imageId),
    encodeURIComponent(options.filename),
  ].join("/");
}

function getProfileImageObjectKey(options: {
  filename: string;
  imageId: string;
  userId: string;
}) {
  return [
    "users",
    encodeObjectKeySegment(options.userId),
    "profile",
    encodeObjectKeySegment(options.imageId),
    options.filename,
  ].join("/");
}

function encodeObjectKeySegment(value: string) {
  return encodeURIComponent(value).replace(/%2F/gi, "-");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function deletePreviousProfileImage(
  storage: ImageStorage,
  image: string | null | undefined,
  userId: string,
  exceptObjectKey?: string,
) {
  const objectKey = getOwnedProfileImageObjectKey(image, userId);

  if (objectKey && objectKey !== exceptObjectKey) {
    await deleteProfileImageObject(storage, objectKey);
  }
}

async function deleteProfileImageObject(
  storage: ImageStorage,
  objectKey: string,
) {
  await storage.delete(objectKey).catch((error) => {
    console.error("Failed to delete previous profile image", error);
  });
}

function getOwnedProfileImageObjectKey(
  image: string | null | undefined,
  userId: string,
) {
  if (!image) {
    return null;
  }

  const match = image.match(
    /^\/user-settings\/profile\/images\/([^/]+)\/([^/]+)\/([^/]+)$/,
  );

  if (!match) {
    return null;
  }

  const [, encodedUserId, encodedImageId, encodedFilename] = match;
  const storedUserId = safeDecodeURIComponent(encodedUserId);
  const imageId = safeDecodeURIComponent(encodedImageId);
  const decodedFilename = safeDecodeURIComponent(encodedFilename);

  if (
    !storedUserId ||
    !imageId ||
    !decodedFilename ||
    storedUserId !== userId ||
    !isUuid(imageId)
  ) {
    return null;
  }

  const filename = sanitizeFilename(decodedFilename);

  return getProfileImageObjectKey({ filename, imageId, userId });
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
