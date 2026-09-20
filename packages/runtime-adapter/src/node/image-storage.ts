import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  ImageStorage,
  RuntimeEnv,
  StoredObjectMetadata,
} from "@zilobase/runtime-ports";

type S3Config = {
  accessKeyId: string;
  bucketName: string;
  endpoint: string;
  publicEndpoint: string;
  secretAccessKey: string;
};

export function createNodeImageStorage(env: RuntimeEnv): ImageStorage {
  return new S3ImageStorage(getS3Config(env));
}

class S3ImageStorage implements ImageStorage {
  readonly mode = "s3" as const;
  private readonly bucketName: string;
  private readonly client: S3Client;
  private readonly publicClient: S3Client;

  constructor(config: S3Config) {
    this.bucketName = config.bucketName;
    const sharedConfig = {
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
      region: "auto",
    };
    this.client = new S3Client({ ...sharedConfig, endpoint: config.endpoint });
    this.publicClient = config.publicEndpoint === config.endpoint
      ? this.client
      : new S3Client({ ...sharedConfig, endpoint: config.publicEndpoint });
  }

  async checkReady() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucketName }));
  }

  async createUploadUrl(options: {
    byteSize: number;
    contentType: string;
    expiresInSeconds: number;
    objectKey: string;
  }) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      ContentType: options.contentType,
      Key: options.objectKey,
    });
    const url = await getSignedUrl(this.publicClient, command, {
      expiresIn: options.expiresInSeconds,
    });
    return {
      expiresAt: new Date(Date.now() + options.expiresInSeconds * 1_000).toISOString(),
      headers: { "Content-Type": options.contentType },
      method: "PUT" as const,
      storageMode: this.mode,
      url,
    };
  }

  async createReadUrl(options: {
    expiresInSeconds: number;
    filename?: string;
    objectKey: string;
  }) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: options.objectKey,
      ResponseContentDisposition: options.filename
        ? `inline; filename="${options.filename.replace(/["\\\r\n]/g, "_")}"`
        : undefined,
    });
    return getSignedUrl(this.publicClient, command, {
      expiresIn: options.expiresInSeconds,
    });
  }

  async delete(objectKey: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: objectKey }));
  }

  async get(objectKey: string) {
    const readUrl = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucketName, Key: objectKey }),
      { expiresIn: 60 },
    );
    const response = await fetch(readUrl);
    if (response.status === 404) return null;
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
      return toMetadata(await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: objectKey }),
      ));
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async putObject(): Promise<StoredObjectMetadata> {
    throw new Error("Direct server uploads are only supported in binding mode");
  }
}

function getS3Config(env: RuntimeEnv): S3Config {
  const read = (key: string) => {
    const value = env[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  const endpoint = read("S3_ENDPOINT");
  const publicEndpoint = read("S3_PUBLIC_ENDPOINT") ?? endpoint;
  const accessKeyId = read("S3_ACCESS_KEY_ID");
  const secretAccessKey = read("S3_SECRET_ACCESS_KEY");
  const bucketName = read("S3_BUCKET_NAME");
  const missing = [
    ["S3_ACCESS_KEY_ID", accessKeyId],
    ["S3_SECRET_ACCESS_KEY", secretAccessKey],
    ["S3_BUCKET_NAME", bucketName],
    ["S3_ENDPOINT", endpoint],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Missing S3 configuration: ${missing.join(", ")}`);
  }
  return {
    accessKeyId: accessKeyId!,
    bucketName: bucketName!,
    endpoint: endpoint!,
    publicEndpoint: publicEndpoint!,
    secretAccessKey: secretAccessKey!,
  };
}

function toMetadata(response: HeadObjectCommandOutput): StoredObjectMetadata {
  return {
    byteSize: response.ContentLength,
    contentType: response.ContentType,
    etag: response.ETag,
    uploadedAt: response.LastModified,
  };
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { $metadata?: { httpStatusCode?: number }; name?: string };
  return value.$metadata?.httpStatusCode === 404 || value.name === "NotFound";
}

function parseContentLength(value: string | null) {
  const parsed = value ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}
