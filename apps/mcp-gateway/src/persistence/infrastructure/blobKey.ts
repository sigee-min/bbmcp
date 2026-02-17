import type { BlobPointer } from '@ashfox/backend-core';
import { normalizeBlobBucket, normalizeBlobKey, normalizeBlobPrefix } from './validation';

export type NormalizedBlobPointer = {
  bucket: string;
  key: string;
  storageKey: string;
};

export const toStorageKey = (key: string, keyPrefix: string | undefined): string => {
  const normalizedKey = normalizeBlobKey(key);
  const normalizedPrefix = normalizeBlobPrefix(keyPrefix);
  if (!normalizedPrefix) return normalizedKey;
  return `${normalizedPrefix}/${normalizedKey}`;
};

export const fromStorageKey = (storageKey: string, keyPrefix: string | undefined): string => {
  const normalizedPrefix = normalizeBlobPrefix(keyPrefix);
  if (!normalizedPrefix) return storageKey;
  const prefix = `${normalizedPrefix}/`;
  if (!storageKey.startsWith(prefix)) return storageKey;
  return storageKey.slice(prefix.length);
};

export const toStoragePointer = (
  pointer: Pick<BlobPointer, 'bucket' | 'key'>,
  keyPrefix: string | undefined
): NormalizedBlobPointer => {
  const bucket = normalizeBlobBucket(pointer.bucket);
  const key = normalizeBlobKey(pointer.key);
  return {
    bucket,
    key,
    storageKey: toStorageKey(key, keyPrefix)
  };
};
