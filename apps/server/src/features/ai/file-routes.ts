import { and, eq, gt } from "drizzle-orm";
import { Hono } from "hono";
import * as z from "zod";

import {
  AI_FILE_MAX_BYTES,
  contentTypeForAiFileKind,
  extractAiFile,
} from "../../ai/ai-file-extraction";
import {
  readAiStoredObject,
  sanitizeAiFilename,
  sha256Hex,
} from "../../ai/ai-file-storage";
import { getStringEnv } from "../../config";
import { db } from "../../db";
import { aiChatArtifact, aiChatUpload } from "../../db/schema";
import { createImageStorage, resolveImageStorageMode } from "../../image-storage";
import type { AppBindings } from "../../types";
import { requireActiveWorkspace } from "../../routes/workspace-settings/shared";
import { getAiChatThreadForUser } from "../../ai/chat-persistence";

const uploadInputSchema = z.object({
  byteSize: z.number().int().positive().max(AI_FILE_MAX_BYTES),
  contentType: z.string().trim().min(1).max(160),
  filename: z.string().trim().min(1).max(240),
  threadId: z.string().trim().min(1),
});

const AI_UPLOAD_TTL_MS = 24 * 60 * 60 * 1_000;
const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

export const aiFileRoutes = new Hono<AppBindings>();

aiFileRoutes.post("/files/uploads", async (c) => {
  const auth = await requireActiveWorkspace(c);
  if ("response" in auth) return auth.response;

  const parsed = uploadInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid file upload request" }, 400);

  const thread = await getAiChatThreadForUser({
    threadId: parsed.data.threadId,
    userId: auth.user.id,
    workspaceId: auth.workspaceId,
  });
  if (!thread) return c.json({ error: "Thread not found" }, 404);

  const id = crypto.randomUUID();
  const filename = sanitizeAiFilename(parsed.data.filename);
  const objectKey = `ai/uploads/${auth.workspaceId}/${auth.user.id}/${id}/${filename}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + AI_UPLOAD_TTL_MS);
  const storage = createImageStorage(c.env);
  const storageMode = resolveImageStorageMode(c.env);

  await db.insert(aiChatUpload).values({
    byteSize: parsed.data.byteSize,
    contentType: normalizeContentType(parsed.data.contentType),
    createdAt: now,
    expiresAt,
    filename,
    id,
    objectKey,
    status: "pending",
    threadId: thread.id,
    updatedAt: now,
    userId: auth.user.id,
    workspaceId: auth.workspaceId,
  });

  const upload = storageMode === "s3"
    ? await storage.createUploadUrl({
        byteSize: parsed.data.byteSize,
        contentType: normalizeContentType(parsed.data.contentType),
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
        objectKey,
      })
    : {
        expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1_000).toISOString(),
        headers: { "Content-Type": normalizeContentType(parsed.data.contentType) },
        method: "PUT" as const,
        storageMode,
        url: `/api/ai/files/${id}/body`,
      };

  return c.json({
    file: {
      byteSize: parsed.data.byteSize,
      contentType: normalizeContentType(parsed.data.contentType),
      expiresAt: expiresAt.toISOString(),
      filename,
      id,
    },
    upload,
  });
});

aiFileRoutes.put("/files/:fileId/body", async (c) => {
  const auth = await requireActiveWorkspace(c);
  if ("response" in auth) return auth.response;
  if (resolveImageStorageMode(c.env) !== "binding") {
    return c.json({ error: "Server upload route is only available in binding mode" }, 409);
  }

  const record = await readOwnedUpload(c.req.param("fileId"), auth);
  if (!record || record.status !== "pending") return c.json({ error: "Upload not found" }, 404);
  if (!c.req.raw.body) return c.json({ error: "File body is required" }, 400);

  const length = Number(c.req.header("content-length"));
  if (Number.isFinite(length) && (length > record.byteSize || length > AI_FILE_MAX_BYTES)) {
    return c.json({ error: "File is too large" }, 413);
  }

  await createImageStorage(c.env).putObject({
    body: c.req.raw.body,
    contentType: record.contentType,
    objectKey: record.objectKey,
  });
  return c.json({ ok: true });
});

aiFileRoutes.post("/files/:fileId/complete", async (c) => {
  const auth = await requireActiveWorkspace(c);
  if ("response" in auth) return auth.response;

  const record = await readOwnedUpload(c.req.param("fileId"), auth);
  if (!record) return c.json({ error: "Upload not found" }, 404);
  if (record.status === "ready") return c.json({ file: toFileResponse(record) });
  if (record.status !== "pending") return c.json({ error: "Upload cannot be completed" }, 409);

  const storage = createImageStorage(c.env);
  try {
    const { bytes, metadata } = await readAiStoredObject(
      storage,
      record.objectKey,
      AI_FILE_MAX_BYTES,
    );
    if (bytes.byteLength !== record.byteSize) {
      throw new Error("Uploaded byte size does not match the reservation.");
    }
    if (
      metadata.contentType &&
      normalizeContentType(metadata.contentType) !== record.contentType
    ) {
      throw new Error("Uploaded content type does not match the reservation.");
    }

    const extraction = extractAiFile({
      bytes,
      contentType: record.contentType,
      filename: record.filename,
    });
    const contentType = contentTypeForAiFileKind(
      extraction.kind,
      record.contentType,
    );
    const now = new Date();
    const [ready] = await db
      .update(aiChatUpload)
      .set({
        checksum: await sha256Hex(bytes),
        contentType,
        extractedText: extraction.text,
        extraction: {
          kind: extraction.kind,
          mode: extraction.mode,
          truncated: extraction.truncated,
        },
        status: "ready",
        updatedAt: now,
        uploadedAt: now,
      })
      .where(eq(aiChatUpload.id, record.id))
      .returning();
    return c.json({ file: toFileResponse(ready!) });
  } catch (error) {
    await storage.delete(record.objectKey).catch(() => undefined);
    await db
      .update(aiChatUpload)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(aiChatUpload.id, record.id));
    return c.json(
      { error: error instanceof Error ? error.message : "File validation failed" },
      415,
    );
  }
});

aiFileRoutes.get("/files/:fileId/download", async (c) => {
  const auth = await requireActiveWorkspace(c);
  if ("response" in auth) return auth.response;
  const record = await readOwnedUpload(c.req.param("fileId"), auth);
  if (!record || record.status !== "ready") return c.json({ error: "File not found" }, 404);
  return downloadStoredFile(c.env, record);
});

aiFileRoutes.get("/artifacts/:artifactId/download", async (c) => {
  const auth = await requireActiveWorkspace(c);
  if ("response" in auth) return auth.response;
  const [record] = await db
    .select()
    .from(aiChatArtifact)
    .where(and(
      eq(aiChatArtifact.id, c.req.param("artifactId")),
      eq(aiChatArtifact.workspaceId, auth.workspaceId),
      eq(aiChatArtifact.userId, auth.user.id),
      eq(aiChatArtifact.status, "ready"),
      gt(aiChatArtifact.expiresAt, new Date()),
    ))
    .limit(1);
  if (!record) return c.json({ error: "Artifact not found" }, 404);
  return downloadStoredFile(c.env, record);
});

async function readOwnedUpload(
  id: string,
  auth: { user: { id: string }; workspaceId: string },
) {
  const [record] = await db
    .select()
    .from(aiChatUpload)
    .where(and(
      eq(aiChatUpload.id, id),
      eq(aiChatUpload.workspaceId, auth.workspaceId),
      eq(aiChatUpload.userId, auth.user.id),
      gt(aiChatUpload.expiresAt, new Date()),
    ))
    .limit(1);
  return record ?? null;
}

async function downloadStoredFile(
  env: AppBindings["Bindings"],
  record: { contentType: string; filename: string; objectKey: string },
) {
  const storage = createImageStorage(env);
  if (storage.mode === "s3") {
    const url = await storage.createReadUrl({
      expiresInSeconds: Number(getStringEnv(env, "IMAGE_READ_URL_TTL_SECONDS")) || DOWNLOAD_URL_TTL_SECONDS,
      filename: record.filename,
      objectKey: record.objectKey,
    });
    return Response.redirect(url, 302);
  }

  const object = await storage.get(record.objectKey);
  if (!object) return Response.json({ error: "Stored file not found" }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "cache-control": "private, max-age=60",
      "content-disposition": `attachment; filename="${record.filename.replace(/["\\\r\n]/g, "_")}"`,
      "content-type": record.contentType,
      "x-content-type-options": "nosniff",
    },
  });
}

function normalizeContentType(value: string) {
  return value.split(";", 1)[0]?.trim().toLowerCase() || "application/octet-stream";
}

function toFileResponse(record: typeof aiChatUpload.$inferSelect) {
  return {
    byteSize: record.byteSize,
    contentType: record.contentType,
    downloadUrl: `/api/ai/files/${record.id}/download`,
    expiresAt: record.expiresAt.toISOString(),
    filename: record.filename,
    id: record.id,
    status: record.status,
  };
}
