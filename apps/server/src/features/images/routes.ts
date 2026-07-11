import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import {
  canAccessPageInWorkspace,
  getPageRecord,
} from "../../access";
import { rejectMismatchedApiKeyWorkspace } from "../../api-keys";
import { getStringEnv } from "../../config";
import { db } from "../../db";
import { database, imageAsset } from "../../db/schema";
import {
  createImageStorage,
  resolveImageStorageMode,
} from "../../image-storage";
import type { AppBindings } from "../../types";

export const imageRoutes = new Hono<AppBindings>();

const defaultMaxImageBytes = 10 * 1024 * 1024;
const defaultUploadUrlTtlSeconds = 10 * 60;
const defaultReadUrlTtlSeconds = 5 * 60;
const allowedImageContentTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

type CreateUploadBody = {
  byteSize?: unknown;
  contentType?: unknown;
  databaseId?: unknown;
  filename?: unknown;
  workspaceId?: unknown;
  pageId?: unknown;
};

imageRoutes.post("/uploads", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await readJsonBody<CreateUploadBody>(c);

  if (!body) {
    return c.json({ error: "Request body must be valid JSON" }, 400);
  }

  const workspaceId = readString(body.workspaceId);
  const pageId = readString(body.pageId);
  const filename = sanitizeFilename(readString(body.filename) ?? "image");
  const contentType = normalizeContentType(readString(body.contentType));
  const byteSize = readPositiveInteger(body.byteSize);
  const databaseId = readString(body.databaseId);

  if (!workspaceId || !pageId) {
    return c.json({ error: "workspaceId and pageId are required" }, 400);
  }

  const mismatch = rejectMismatchedApiKeyWorkspace(c, workspaceId);

  if (mismatch) {
    return mismatch;
  }

  if (!contentType || !allowedImageContentTypes.has(contentType)) {
    return c.json({ error: "A supported image contentType is required" }, 400);
  }

  const maxBytes = getImageUploadMaxBytes(c);

  if (!byteSize || byteSize > maxBytes) {
    return c.json(
      { error: `byteSize must be between 1 and ${maxBytes}` },
      400,
    );
  }

  const page = await getPageRecord(pageId);

  if (!page || page.workspaceId !== workspaceId) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(pageId, workspaceId, user.id, "edit"))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (databaseId && !(await isWorkspaceDatabase(databaseId, workspaceId))) {
    return c.json({ error: "Database not found" }, 404);
  }

  const storageMode = resolveImageStorageMode(c.env);
  const storage = createImageStorage(c.env);
  const assetId = crypto.randomUUID();
  const objectKey = getImageObjectKey({
    assetId,
    filename,
    workspaceId,
    pageId,
  });
  const createdAt = new Date();

  await db.insert(imageAsset).values({
    byteSize,
    contentType,
    createdAt,
    createdById: user.id,
    databaseId,
    filename,
    id: assetId,
    objectKey,
    workspaceId,
    status: "pending",
    pageId,
  });

  if (storageMode === "s3") {
    const upload = await storage.createUploadUrl({
      byteSize,
      contentType,
      expiresInSeconds: getUploadUrlTtlSeconds(c),
      objectKey,
    });

    return c.json({
      asset: toImageAssetResponse({
        byteSize,
        contentType,
        filename,
        id: assetId,
        status: "pending",
      }),
      upload,
    });
  }

  const url = `/images/uploads/${assetId}/body`;

  return c.json({
    asset: toImageAssetResponse({
      byteSize,
      contentType,
      filename,
      id: assetId,
      status: "pending",
    }),
    upload: {
      expiresAt: new Date(
        Date.now() + getUploadUrlTtlSeconds(c) * 1000,
      ).toISOString(),
      headers: {
        "Content-Type": contentType,
      },
      method: "PUT" as const,
      storageMode,
      url,
    },
  });
});

imageRoutes.put("/uploads/:assetId/body", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (resolveImageStorageMode(c.env) !== "binding") {
    return c.json({ error: "Server upload route is only available in binding mode" }, 409);
  }

  const asset = await getActiveImageAsset(c.req.param("assetId"));

  if (!asset) {
    return c.json({ error: "Image asset not found" }, 404);
  }

  const forbidden = await requirePageAccess(c, asset, "edit");

  if (forbidden) {
    return forbidden;
  }

  if (asset.status !== "pending") {
    return c.json({ error: "Image asset is not pending upload" }, 409);
  }

  const contentType = normalizeContentType(c.req.header("content-type"));

  if (contentType !== asset.contentType) {
    return c.json({ error: "Content-Type does not match upload request" }, 400);
  }

  const contentLength = readPositiveInteger(c.req.header("content-length"));

  if (contentLength && contentLength > asset.byteSize) {
    return c.json({ error: "Uploaded image is larger than expected" }, 413);
  }

  if (!c.req.raw.body) {
    return c.json({ error: "Image body is required" }, 400);
  }

  const storage = createImageStorage(c.env);

  await storage.putObject({
    body: c.req.raw.body,
    contentType: asset.contentType,
    objectKey: asset.objectKey,
  });

  return c.json({ ok: true });
});

imageRoutes.post("/uploads/:assetId/complete", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const asset = await getActiveImageAsset(c.req.param("assetId"));

  if (!asset) {
    return c.json({ error: "Image asset not found" }, 404);
  }

  const forbidden = await requirePageAccess(c, asset, "edit");

  if (forbidden) {
    return forbidden;
  }

  if (asset.status === "uploaded") {
    return c.json({ asset: toImageAssetResponse(asset) });
  }

  if (asset.status !== "pending") {
    return c.json({ error: "Image asset cannot be completed" }, 409);
  }

  const storage = createImageStorage(c.env);
  const object = await storage.head(asset.objectKey);

  if (!object) {
    return c.json({ error: "Uploaded image object was not found" }, 409);
  }

  if (object.byteSize !== undefined && object.byteSize > asset.byteSize) {
    await db
      .update(imageAsset)
      .set({ status: "failed" })
      .where(eq(imageAsset.id, asset.id));
    await storage.delete(asset.objectKey).catch(() => undefined);

    return c.json({ error: "Uploaded image is larger than expected" }, 413);
  }

  if (
    object.contentType &&
    normalizeContentType(object.contentType) !== asset.contentType
  ) {
    await db
      .update(imageAsset)
      .set({ status: "failed" })
      .where(eq(imageAsset.id, asset.id));

    return c.json({ error: "Uploaded image content type does not match" }, 415);
  }

  const [updated] = await db
    .update(imageAsset)
    .set({
      status: "uploaded",
      uploadedAt: new Date(),
    })
    .where(eq(imageAsset.id, asset.id))
    .returning();

  return c.json({ asset: toImageAssetResponse(updated ?? asset) });
});

imageRoutes.get("/:assetId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const asset = await getReadableImageAsset(c.req.param("assetId"));

  if (!asset) {
    return c.json({ error: "Image asset not found" }, 404);
  }

  const forbidden = await requirePageAccess(c, asset, "view");

  if (forbidden) {
    return forbidden;
  }

  const storage = createImageStorage(c.env);
  const object = await storage.get(asset.objectKey);

  if (!object) {
    return c.json({ error: "Image object not found" }, 404);
  }

  const headers = new Headers();

  headers.set("cache-control", "private, max-age=60");
  headers.set("content-disposition", getContentDisposition(c, asset.filename));
  headers.set("content-type", object.contentType ?? asset.contentType);

  if (object.byteSize !== undefined) {
    headers.set("content-length", String(object.byteSize));
  }

  return new Response(object.body, { headers });
});

imageRoutes.get("/:assetId/url", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const asset = await getReadableImageAsset(c.req.param("assetId"));

  if (!asset) {
    return c.json({ error: "Image asset not found" }, 404);
  }

  const forbidden = await requirePageAccess(c, asset, "view");

  if (forbidden) {
    return forbidden;
  }

  const storage = createImageStorage(c.env);

  if (storage.mode === "s3") {
    const expiresInSeconds = getReadUrlTtlSeconds(c);

    return c.json({
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      storageMode: storage.mode,
      url: await storage.createReadUrl({
        expiresInSeconds,
        filename: asset.filename,
        objectKey: asset.objectKey,
      }),
    });
  }

  return c.json({
    expiresAt: null,
    storageMode: storage.mode,
    url: `/images/${asset.id}`,
  });
});

imageRoutes.delete("/:assetId", async (c) => {
  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const asset = await getActiveImageAsset(c.req.param("assetId"));

  if (!asset) {
    return c.json({ error: "Image asset not found" }, 404);
  }

  const forbidden = await requirePageAccess(c, asset, "edit");

  if (forbidden) {
    return forbidden;
  }

  await db
    .update(imageAsset)
    .set({ deletedAt: new Date(), status: "deleted" })
    .where(eq(imageAsset.id, asset.id));
  await createImageStorage(c.env).delete(asset.objectKey).catch((error) => {
    console.error("Failed to delete image object", error);
  });

  return c.json({ ok: true });
});

function requireUser(c: Context<AppBindings>) {
  return c.get("user") ?? null;
}

async function readJsonBody<T>(c: Context<AppBindings>) {
  try {
    return (await c.req.json()) as T;
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readPositiveInteger(value: unknown) {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isSafeInteger(numberValue) && numberValue > 0
    ? numberValue
    : undefined;
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

function getImageObjectKey(options: {
  assetId: string;
  filename: string;
  workspaceId: string;
  pageId: string;
}) {
  return [
    "org",
    encodeObjectKeySegment(options.workspaceId),
    "page",
    encodeObjectKeySegment(options.pageId),
    "images",
    options.assetId,
    options.filename,
  ].join("/");
}

function encodeObjectKeySegment(value: string) {
  return encodeURIComponent(value).replace(/%2F/gi, "-");
}

async function getActiveImageAsset(id: string) {
  const [asset] = await db
    .select()
    .from(imageAsset)
    .where(and(eq(imageAsset.id, id), isNull(imageAsset.deletedAt)))
    .limit(1);

  return asset ?? null;
}

async function isWorkspaceDatabase(id: string, workspaceId: string) {
  const [record] = await db
    .select({ id: database.id })
    .from(database)
    .where(
      and(
        eq(database.id, id),
        eq(database.workspaceId, workspaceId),
        isNull(database.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(record);
}

async function getReadableImageAsset(id: string) {
  const asset = await getActiveImageAsset(id);

  return asset?.status === "uploaded" ? asset : null;
}

async function requirePageAccess(
  c: Context<AppBindings>,
  asset: typeof imageAsset.$inferSelect,
  required: "view" | "edit",
) {
  const mismatch = rejectMismatchedApiKeyWorkspace(c, asset.workspaceId);

  if (mismatch) {
    return mismatch;
  }

  const user = requireUser(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const page = await getPageRecord(asset.pageId);

  if (!page || page.workspaceId !== asset.workspaceId) {
    return c.json({ error: "Page not found" }, 404);
  }

  if (!(await canAccessPageInWorkspace(
    asset.pageId,
    asset.workspaceId,
    user.id,
    required,
  ))) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return null;
}

function getImageUploadMaxBytes(c: Context<AppBindings>) {
  return readPositiveInteger(getStringEnv(c.env, "IMAGE_UPLOAD_MAX_BYTES")) ??
    defaultMaxImageBytes;
}

function getUploadUrlTtlSeconds(c: Context<AppBindings>) {
  return readPositiveInteger(
    getStringEnv(c.env, "IMAGE_UPLOAD_URL_TTL_SECONDS"),
  ) ?? defaultUploadUrlTtlSeconds;
}

function getReadUrlTtlSeconds(c: Context<AppBindings>) {
  return readPositiveInteger(getStringEnv(c.env, "IMAGE_READ_URL_TTL_SECONDS")) ??
    defaultReadUrlTtlSeconds;
}

function toImageAssetResponse(asset: {
  byteSize: number;
  contentType: string;
  filename: string;
  id: string;
  status: string;
}) {
  return {
    byteSize: asset.byteSize,
    contentType: asset.contentType,
    filename: asset.filename,
    id: asset.id,
    status: asset.status,
  };
}

function getContentDisposition(
  c: Context<AppBindings>,
  filename: string,
) {
  const disposition = c.req.query("disposition") === "attachment"
    ? "attachment"
    : "inline";
  const safeFilename = filename.replace(/["\\\r\n]/g, "_");

  return `${disposition}; filename="${safeFilename}"`;
}
