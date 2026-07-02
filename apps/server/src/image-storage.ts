import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getStringEnv, type RuntimeEnv } from "./config";
import {
  getConfiguredImageStorageMode,
  getRuntimeAdapter,
} from "./runtime-adapter";

export type ImageStorageMode = "s3" | "binding";

export type StoredImageObject = {
  body: ReadableStream;
  byteSize?: number;
  contentType?: string;
  etag?: string;
  uploadedAt?: Date;
};

export type StoredImageMetadata = Omit<StoredImageObject, "body">;

export type CreateUploadUrlOptions = {
  byteSize: number;
  contentType: string;
  expiresInSeconds: number;
  objectKey: string;
};

export type CreateReadUrlOptions = {
  expiresInSeconds: number;
  filename?: string;
  objectKey: string;
};

export type PutObjectOptions = {
  body: ReadableStream | ArrayBuffer | Blob;
  contentType: string;
  objectKey: string;
};

export type ImageUploadTarget = {
  expiresAt: string;
  headers: Record<string, string>;
  method: "PUT";
  storageMode: ImageStorageMode;
  url: string;
};

export type ImageStorage = {
  createReadUrl(options: CreateReadUrlOptions): Promise<string>;
  createUploadUrl(options: CreateUploadUrlOptions): Promise<ImageUploadTarget>;
  delete(objectKey: string): Promise<void>;
  get(objectKey: string): Promise<StoredImageObject | null>;
  head(objectKey: string): Promise<StoredImageMetadata | null>;
  mode: ImageStorageMode;
  putObject(options: PutObjectOptions): Promise<StoredImageMetadata>;
};

type S3Config = {
  accessKeyId: string;
  bucketName: string;
  endpoint: string;
  secretAccessKey: string;
};

export function createImageStorage(env: RuntimeEnv): ImageStorage {
  const adapterStorage = getRuntimeAdapter().createImageStorage?.(env);

  if (adapterStorage) {
    return adapterStorage;
  }

  return createS3ImageStorage(env);
}

export function resolveImageStorageMode(env: RuntimeEnv): ImageStorageMode {
  const adapterMode = getRuntimeAdapter().getImageStorageMode?.(env);

  if (adapterMode) {
    return adapterMode;
  }

  const configured = getConfiguredImageStorageMode(env);

  if (!configured) {
    return "s3";
  }

  return configured;
}

export function createS3ImageStorage(env: RuntimeEnv): ImageStorage {
  return new S3ImageStorage(getS3Config(env));
}

class S3ImageStorage implements ImageStorage {
  readonly mode = "s3" as const;
  private readonly bucketName: string;
  private readonly client: S3Client;

  constructor(config: S3Config) {
    this.bucketName = config.bucketName;
    this.client = new S3Client({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
      forcePathStyle: true,
      region: "auto",
    });
  }

  async createUploadUrl(options: CreateUploadUrlOptions) {
    const expiresAt = getExpiresAt(options.expiresInSeconds);
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      ContentType: options.contentType,
      Key: options.objectKey,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: options.expiresInSeconds,
    });

    return {
      expiresAt,
      headers: {
        "Content-Type": options.contentType,
      },
      method: "PUT" as const,
      storageMode: this.mode,
      url,
    };
  }

  async createReadUrl(options: CreateReadUrlOptions) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: options.objectKey,
      ResponseContentDisposition: options.filename
        ? getInlineContentDisposition(options.filename)
        : undefined,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: options.expiresInSeconds,
    });
  }

  async delete(objectKey: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      }),
    );
  }

  async get(objectKey: string) {
    const readUrl = await this.createReadUrl({
      expiresInSeconds: 60,
      objectKey,
    });
    const response = await fetch(readUrl);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok || !response.body) {
      throw new Error(`Unable to read image object: ${response.status}`);
    }

    return {
      body: response.body,
      byteSize: parseContentLength(response.headers.get("content-length")),
      contentType: response.headers.get("content-type") ?? undefined,
      etag: response.headers.get("etag") ?? undefined,
    };
  }

  async head(objectKey: string) {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: objectKey,
        }),
      );

      return toS3Metadata(response);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }

      throw error;
    }
  }

  async putObject(_options: PutObjectOptions): Promise<StoredImageMetadata> {
    throw new Error("Direct server uploads are only supported in binding mode");
  }
}

function getS3Config(env: RuntimeEnv): S3Config {
  const accountId = getStringEnv(env, "R2_ACCOUNT_ID");
  const endpoint =
    getStringEnv(env, "R2_ENDPOINT") ??
    (accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : undefined);
  const accessKeyId = getStringEnv(env, "R2_ACCESS_KEY_ID");
  const secretAccessKey = getStringEnv(env, "R2_SECRET_ACCESS_KEY");
  const bucketName = getStringEnv(env, "R2_BUCKET_NAME");
  const missing = [
    ["R2_ACCESS_KEY_ID", accessKeyId],
    ["R2_SECRET_ACCESS_KEY", secretAccessKey],
    ["R2_BUCKET_NAME", bucketName],
    ["R2_ENDPOINT or R2_ACCOUNT_ID", endpoint],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing R2 S3 configuration for IMAGE_STORAGE_MODE=s3: ${missing.join(", ")}`,
    );
  }

  return {
    accessKeyId: accessKeyId!,
    bucketName: bucketName!,
    endpoint: endpoint!,
    secretAccessKey: secretAccessKey!,
  };
}

function hasS3Config(env: RuntimeEnv) {
  return Boolean(
    getStringEnv(env, "R2_ACCESS_KEY_ID") &&
      getStringEnv(env, "R2_SECRET_ACCESS_KEY") &&
      getStringEnv(env, "R2_BUCKET_NAME") &&
      (getStringEnv(env, "R2_ENDPOINT") || getStringEnv(env, "R2_ACCOUNT_ID")),
  );
}

function getExpiresAt(expiresInSeconds: number) {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

function toS3Metadata(response: HeadObjectCommandOutput): StoredImageMetadata {
  return {
    byteSize: response.ContentLength,
    contentType: response.ContentType,
    etag: response.ETag,
    uploadedAt: response.LastModified,
  };
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as {
    $metadata?: { httpStatusCode?: number };
    name?: string;
  };

  return value.$metadata?.httpStatusCode === 404 || value.name === "NotFound";
}

function parseContentLength(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function getInlineContentDisposition(filename: string) {
  const safeFilename = filename.replace(/["\\\r\n]/g, "_");

  return `inline; filename="${safeFilename}"`;
}
