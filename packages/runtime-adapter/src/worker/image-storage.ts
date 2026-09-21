import type { ImageStorage, StoredObjectMetadata } from "@zilobase/runtime-ports";

export type WorkerR2Object = {
  body: ReadableStream;
  etag: string;
  httpMetadata?: { contentType?: string };
  size: number;
  uploaded: Date;
};

export type WorkerR2Bucket = {
  delete(objectKey: string): Promise<void>;
  get(objectKey: string): Promise<WorkerR2Object | null>;
  head(objectKey: string): Promise<Omit<WorkerR2Object, "body"> | null>;
  put(
    objectKey: string,
    body: ReadableStream | ArrayBuffer | Blob,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<Omit<WorkerR2Object, "body">>;
};

export function createWorkerImageStorage(bucket: WorkerR2Bucket): ImageStorage {
  return new R2ImageStorage(bucket);
}

class R2ImageStorage implements ImageStorage {
  readonly mode = "binding" as const;
  constructor(private readonly bucket: WorkerR2Bucket) {}
  async checkReady() { await this.bucket.head("__zilobase_readiness__"); }
  async createUploadUrl(): Promise<never> { throw new Error("Presigned upload URLs are only supported in s3 mode"); }
  async createReadUrl(): Promise<never> { throw new Error("Presigned read URLs are only supported in s3 mode"); }
  async delete(objectKey: string) { await this.bucket.delete(objectKey); }
  async get(objectKey: string) {
    const object = await this.bucket.get(objectKey);
    return object ? { body: object.body, ...metadata(object) } : null;
  }
  async head(objectKey: string) {
    const object = await this.bucket.head(objectKey);
    return object ? metadata(object) : null;
  }
  async putObject(options: Parameters<ImageStorage["putObject"]>[0]) {
    return metadata(await this.bucket.put(options.objectKey, options.body, {
      httpMetadata: { contentType: options.contentType },
    }));
  }
}

function metadata(object: Omit<WorkerR2Object, "body">): StoredObjectMetadata {
  return {
    byteSize: object.size,
    contentType: object.httpMetadata?.contentType,
    etag: object.etag,
    uploadedAt: object.uploaded,
  };
}
