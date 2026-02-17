import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { BlobPointer, BlobReadResult, BlobStore, BlobWriteInput } from '@ashfox/backend-core';
import type { S3BlobStoreConfig } from '../config';
import { normalizeBlobBucket, normalizeBlobKey, normalizeBlobPrefix } from './validation';

export interface S3ClientLike {
  send(command: unknown): Promise<Record<string, unknown>>;
  destroy?(): void;
}

const toStorageKey = (key: string, keyPrefix: string | undefined): string => {
  const normalizedKey = normalizeBlobKey(key);
  const normalizedPrefix = normalizeBlobPrefix(keyPrefix);
  if (!normalizedPrefix) return normalizedKey;
  return `${normalizedPrefix}/${normalizedKey}`;
};

const fromStorageKey = (storageKey: string, keyPrefix: string | undefined): string => {
  const normalizedPrefix = normalizeBlobPrefix(keyPrefix);
  if (!normalizedPrefix) return storageKey;
  const prefix = `${normalizedPrefix}/`;
  if (!storageKey.startsWith(prefix)) return storageKey;
  return storageKey.slice(prefix.length);
};

const isNotFoundError = (error: unknown): boolean => {
  const candidate = error as { name?: string; code?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  const code = candidate.code ?? candidate.Code ?? candidate.name;
  if (code === 'NoSuchKey' || code === 'NoSuchBucket' || code === 'NotFound') return true;
  if (candidate.$metadata?.httpStatusCode === 404) return true;
  return false;
};

const toUint8Array = async (body: unknown): Promise<Uint8Array> => {
  if (!body) return new Uint8Array();
  const candidate = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | Buffer | string>;
  };
  if (typeof candidate.transformToByteArray === 'function') {
    return candidate.transformToByteArray();
  }
  if (body instanceof Uint8Array) return body;
  if (Buffer.isBuffer(body)) return body;
  if (typeof candidate[Symbol.asyncIterator] !== 'function') {
    throw new Error('Unable to read blob bytes from S3 response body.');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of candidate as AsyncIterable<Uint8Array | Buffer | string>) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
      continue;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export class S3BlobStore implements BlobStore {
  private readonly config: S3BlobStoreConfig;
  private readonly client: S3ClientLike;

  constructor(config: S3BlobStoreConfig, client?: S3ClientLike) {
    this.config = config;
    this.client =
      client ??
      new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
          ...(config.sessionToken ? { sessionToken: config.sessionToken } : {})
        }
      });
  }

  async put(input: BlobWriteInput): Promise<BlobPointer> {
    const bucket = normalizeBlobBucket(input.bucket);
    const key = normalizeBlobKey(input.key);
    const storageKey = toStorageKey(key, this.config.keyPrefix);
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: input.bytes,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
        Metadata: input.metadata
      })
    );
    return { bucket, key };
  }

  async get(pointer: BlobPointer): Promise<BlobReadResult | null> {
    const bucket = normalizeBlobBucket(pointer.bucket);
    const key = normalizeBlobKey(pointer.key);
    const storageKey = toStorageKey(key, this.config.keyPrefix);
    try {
      const result = (await this.client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: storageKey
        })
      )) as {
        Body?: unknown;
        ContentType?: string;
        CacheControl?: string;
        Metadata?: Record<string, string>;
        LastModified?: Date;
      };
      const bytes = await toUint8Array(result.Body);
      return {
        bucket,
        key: fromStorageKey(storageKey, this.config.keyPrefix),
        bytes,
        contentType: result.ContentType ?? 'application/octet-stream',
        cacheControl: result.CacheControl,
        metadata: result.Metadata,
        updatedAt: result.LastModified?.toISOString()
      };
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async delete(pointer: BlobPointer): Promise<void> {
    const bucket = normalizeBlobBucket(pointer.bucket);
    const key = normalizeBlobKey(pointer.key);
    const storageKey = toStorageKey(key, this.config.keyPrefix);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: storageKey
        })
      );
    } catch (error) {
      if (isNotFoundError(error)) return;
      throw error;
    }
  }

  async close(): Promise<void> {
    if (typeof this.client.destroy === 'function') {
      this.client.destroy();
    }
  }
}
