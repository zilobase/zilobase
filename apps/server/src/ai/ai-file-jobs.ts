import { eq } from "drizzle-orm";

import {
  contentTypeForAiFileKind,
  extractAiFile,
} from "./ai-file-extraction";
import { readAiStoredObject, sha256Hex } from "./ai-file-storage";
import { db } from "../infrastructure/database";
import { aiChatUpload } from "../infrastructure/database/schema";
import { createImageStorage } from "../infrastructure/storage/image-storage";
import { getRuntimeAdapter } from "../infrastructure/runtime/runtime-adapter";
import { PermanentAiJobError, type AiJobHandler } from "./ai-jobs";

export const extractAiUploadJob: AiJobHandler = async ({ env, job, reportProgress }) => {
  const uploadId = readStringField(job.input, "uploadId");
  const [record] = await db
    .select()
    .from(aiChatUpload)
    .where(eq(aiChatUpload.id, uploadId))
    .limit(1);
  if (!record || record.workspaceId !== job.workspaceId || record.userId !== job.userId) {
    throw new PermanentAiJobError("Upload no longer exists or changed ownership.");
  }
  if (record.status === "ready") return { uploadId: record.id, status: "ready" };
  if (record.status !== "processing" && record.status !== "pending") {
    throw new PermanentAiJobError(`Upload is ${record.status}.`);
  }

  const storage = createImageStorage(env);
  const { bytes, metadata } = await readAiStoredObject(
    storage,
    record.objectKey,
    record.byteSize,
  );
  await reportProgress(25);
  if (bytes.byteLength !== record.byteSize) {
    await rejectUpload(record.id, storage, record.objectKey);
    throw new PermanentAiJobError("Uploaded byte size does not match the reservation.");
  }
  if (
    metadata.contentType &&
    normalizeContentType(metadata.contentType) !== record.contentType
  ) {
    await rejectUpload(record.id, storage, record.objectKey);
    throw new PermanentAiJobError("Uploaded content type does not match the reservation.");
  }

  const scan = getRuntimeAdapter().scanAiFile
    ? await getRuntimeAdapter().scanAiFile!({
        bytes,
        contentType: record.contentType,
        filename: record.filename,
        workspaceId: record.workspaceId,
      })
    : { clean: true, scanner: "not-configured" };
  if (!scan.clean) {
    await rejectUpload(record.id, storage, record.objectKey);
    throw new PermanentAiJobError("The uploaded file failed malware scanning.");
  }
  await reportProgress(50);

  let extraction;
  try {
    extraction = extractAiFile({
      bytes,
      contentType: record.contentType,
      filename: record.filename,
    });
  } catch (error) {
    await rejectUpload(record.id, storage, record.objectKey);
    throw new PermanentAiJobError(
      error instanceof Error ? error.message : "File extraction failed.",
    );
  }
  await reportProgress(85);
  const now = new Date();
  await db.update(aiChatUpload).set({
    checksum: await sha256Hex(bytes),
    contentType: contentTypeForAiFileKind(extraction.kind, record.contentType),
    extractedText: extraction.text,
    extraction: {
      kind: extraction.kind,
      mode: extraction.mode,
      scanner: scan.scanner,
      truncated: extraction.truncated,
    },
    status: "ready",
    updatedAt: now,
    uploadedAt: now,
  }).where(eq(aiChatUpload.id, record.id));
  return { uploadId: record.id, status: "ready" };
};

async function rejectUpload(
  id: string,
  storage: ReturnType<typeof createImageStorage>,
  objectKey: string,
) {
  await storage.delete(objectKey).catch(() => undefined);
  await db.update(aiChatUpload).set({
    status: "rejected",
    updatedAt: new Date(),
  }).where(eq(aiChatUpload.id, id));
}

function readStringField(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PermanentAiJobError("AI job input is invalid.");
  }
  const fieldValue = (value as Record<string, unknown>)[field];
  if (typeof fieldValue !== "string" || !fieldValue) {
    throw new PermanentAiJobError(`AI job input is missing ${field}.`);
  }
  return fieldValue;
}

function normalizeContentType(value: string) {
  return value.split(";", 1)[0]?.trim().toLowerCase() || "application/octet-stream";
}
