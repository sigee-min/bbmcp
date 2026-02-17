import assert from 'node:assert/strict';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { BlobReadResult, BlobWriteInput } from '@ashfox/backend-core';
import type { S3BlobStoreConfig } from '../src/persistence/config';
import { S3BlobStore, type S3ClientLike } from '../src/persistence/infrastructure/S3BlobStore';
import { registerAsync } from './helpers';

type StoredObject = {
  bytes: Uint8Array;
  contentType: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  updatedAt: Date;
};

class FakeS3Client implements S3ClientLike {
  private readonly store = new Map<string, StoredObject>();

  async send(command: unknown): Promise<Record<string, unknown>> {
    if (command instanceof PutObjectCommand) {
      const input = command.input;
      const key = `${String(input.Bucket)}::${String(input.Key)}`;
      const bytes = input.Body instanceof Uint8Array ? input.Body : Buffer.from(String(input.Body ?? ''));
      this.store.set(key, {
        bytes,
        contentType: input.ContentType ?? 'application/octet-stream',
        cacheControl: input.CacheControl,
        metadata: input.Metadata,
        updatedAt: new Date()
      });
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const input = command.input;
      const key = `${String(input.Bucket)}::${String(input.Key)}`;
      const found = this.store.get(key);
      if (!found) {
        const error = new Error('NoSuchKey') as Error & { name: string };
        error.name = 'NoSuchKey';
        throw error;
      }
      return {
        Body: found.bytes,
        ContentType: found.contentType,
        CacheControl: found.cacheControl,
        Metadata: found.metadata,
        LastModified: found.updatedAt
      };
    }
    if (command instanceof DeleteObjectCommand) {
      const input = command.input;
      const key = `${String(input.Bucket)}::${String(input.Key)}`;
      this.store.delete(key);
      return {};
    }
    throw new Error(`Unsupported S3 command: ${String((command as { constructor?: { name?: string } }).constructor?.name)}`);
  }
}

registerAsync(
  (async () => {
    const config: S3BlobStoreConfig = {
      region: 'us-east-1',
      accessKeyId: 'test-access',
      secretAccessKey: 'test-secret',
      forcePathStyle: true,
      keyPrefix: 'prefix',
      requestTimeoutMs: 5000
    };
    const blobStore = new S3BlobStore(config, new FakeS3Client());
    const input: BlobWriteInput = {
      bucket: 'my-bucket',
      key: 'path/to/file.json',
      bytes: Buffer.from('{"ok":true}', 'utf8'),
      contentType: 'application/json',
      cacheControl: 'max-age=60',
      metadata: { source: 'test' }
    };
    await blobStore.put(input);
    const found = (await blobStore.get({
      bucket: 'my-bucket',
      key: 'path/to/file.json'
    })) as BlobReadResult;
    assert.equal(found.contentType, 'application/json');
    assert.equal(Buffer.from(found.bytes).toString('utf8'), '{"ok":true}');
    assert.equal(found.key, 'path/to/file.json');

    await blobStore.delete({
      bucket: 'my-bucket',
      key: 'path/to/file.json'
    });
    const afterDelete = await blobStore.get({
      bucket: 'my-bucket',
      key: 'path/to/file.json'
    });
    assert.equal(afterDelete, null);

    await assert.rejects(
      () =>
        blobStore.put({
          ...input,
          bucket: '   '
        }),
      /bucket must be a non-empty string\./
    );

    await assert.rejects(
      () =>
        blobStore.put({
          ...input,
          bucket: 'bad/bucket'
        }),
      /bucket must not include "\/"\./
    );
  })()
);
