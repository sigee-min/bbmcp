import { createHash } from 'node:crypto';
import path from 'node:path';
import type { BlobPointer, BlobReadResult, BlobStore, BlobWriteInput } from '@ashfox/backend-core';
import type { AppwriteBlobStoreConfig } from '../config';
import {
  appwriteTimeoutError,
  normalizeBlobBucket,
  normalizeBlobKey,
  normalizeBlobPrefix
} from './validation';

export interface AppwriteBlobStoreOptions {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}

type AppwriteFileMetadata = {
  $id?: unknown;
  $updatedAt?: unknown;
  mimeType?: unknown;
};

type BlobMetadataDocument = {
  bucket?: unknown;
  key?: unknown;
  contentType?: unknown;
  cacheControl?: unknown;
  metadataJson?: unknown;
  updatedAt?: unknown;
};

type BlobMetadataRecord = {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  updatedAt?: string;
};

const APPWRITE_CHUNK_BYTES = 5 * 1024 * 1024;

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

const toStorageKey = (key: string, keyPrefix: string | undefined): string => {
  const normalizedKey = normalizeBlobKey(key);
  const normalizedPrefix = normalizeBlobPrefix(keyPrefix);
  if (!normalizedPrefix) return normalizedKey;
  return `${normalizedPrefix}/${normalizedKey}`;
};

const toNamespaceKey = (bucket: string, key: string, keyPrefix: string | undefined): string =>
  `${bucket}/${toStorageKey(key, keyPrefix)}`;

const toFileId = (bucket: string, key: string, keyPrefix: string | undefined): string => {
  const digest = createHash('sha256').update(toNamespaceKey(bucket, key, keyPrefix)).digest('hex');
  return `f${digest.slice(0, 35)}`;
};

const toMetadataDocumentId = (fileId: string): string => `m${fileId.slice(1)}`;

const parseString = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);

const parseTimestamp = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

const parseMetadataMap = (value: unknown): Record<string, string> | undefined => {
  if (!value) return undefined;
  const source = (() => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return null;
      }
    }
    return value;
  })();
  if (!source || typeof source !== 'object') return undefined;
  const entries = Object.entries(source as Record<string, unknown>);
  const metadata: Record<string, string> = {};
  for (const [key, entry] of entries) {
    if (typeof entry === 'string') {
      metadata[key] = entry;
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const buildError = async (response: Response, action: string): Promise<Error> => {
  const raw = (await response.text()).trim();
  if (!raw) {
    return new Error(`Appwrite ${action} failed: ${response.status} ${response.statusText}`);
  }
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; type?: unknown; code?: unknown };
    const message = typeof parsed.message === 'string' ? parsed.message : `${response.status} ${response.statusText}`;
    const type = typeof parsed.type === 'string' ? parsed.type : '';
    const code = typeof parsed.code === 'number' || typeof parsed.code === 'string' ? String(parsed.code) : '';
    const suffix = [type, code].filter(Boolean).join('/');
    return new Error(`Appwrite ${action} failed: ${message}${suffix ? ` (${suffix})` : ''}`);
  } catch {
    return new Error(`Appwrite ${action} failed: ${response.status} ${response.statusText} :: ${raw.slice(0, 300)}`);
  }
};

export class AppwriteBlobStore implements BlobStore {
  private readonly config: AppwriteBlobStoreConfig;
  private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  private readonly filesPath: string;
  private readonly metadataDocumentsPath: string | null;

  constructor(config: AppwriteBlobStoreConfig, options: AppwriteBlobStoreOptions = {}) {
    this.config = {
      ...config,
      baseUrl: normalizeBaseUrl(config.baseUrl),
      keyPrefix: normalizeBlobPrefix(config.keyPrefix)
    };
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.filesPath = `/storage/buckets/${encodeURIComponent(this.config.bucketId)}/files`;
    if (this.config.metadataDatabaseId && this.config.metadataCollectionId) {
      this.metadataDocumentsPath = `/databases/${encodeURIComponent(this.config.metadataDatabaseId)}/collections/${encodeURIComponent(this.config.metadataCollectionId)}/documents`;
    } else {
      this.metadataDocumentsPath = null;
    }
  }

  private async request(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    pathValue: string,
    options: { body?: BodyInit; json?: unknown; headers?: Record<string, string> } = {}
  ): Promise<Response> {
    const url = `${this.config.baseUrl}${pathValue}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const headers = new Headers({
        'x-appwrite-project': this.config.projectId,
        'x-appwrite-key': this.config.apiKey,
        'x-appwrite-response-format': this.config.responseFormat
      });
      if (options.headers) {
        for (const [key, value] of Object.entries(options.headers)) {
          headers.set(key, value);
        }
      }
      let body = options.body;
      if (options.json !== undefined) {
        headers.set('content-type', 'application/json');
        body = JSON.stringify(options.json);
      }
      return await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw appwriteTimeoutError(this.config.requestTimeoutMs, method, pathValue);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildFilePath(fileId: string): string {
    return `${this.filesPath}/${encodeURIComponent(fileId)}`;
  }

  private async uploadFile(fileId: string, bytes: Uint8Array, contentType: string, fileName: string): Promise<Response> {
    const total = bytes.byteLength;
    const parts: Array<{ start: number; end: number }> = [];
    if (total === 0) {
      parts.push({ start: 0, end: 0 });
    } else {
      for (let start = 0; start < total; start += APPWRITE_CHUNK_BYTES) {
        parts.push({ start, end: Math.min(start + APPWRITE_CHUNK_BYTES, total) });
      }
    }

    let lastResponse: Response | null = null;
    for (const part of parts) {
      const chunk = total === 0 ? new Uint8Array() : bytes.slice(part.start, part.end);
      const form = new FormData();
      form.set('fileId', fileId);
      form.set('file', new Blob([chunk], { type: contentType || 'application/octet-stream' }), fileName);
      const headers: Record<string, string> = {};
      if (total > APPWRITE_CHUNK_BYTES) {
        headers['content-range'] = `bytes ${part.start}-${part.end - 1}/${total}`;
        if (part.start > 0) {
          headers['x-appwrite-id'] = fileId;
        }
      }
      const response = await this.request('POST', this.filesPath, {
        body: form,
        headers
      });
      lastResponse = response;
      if (!response.ok) return response;
    }
    if (!lastResponse) {
      throw new Error('Appwrite upload produced no request attempts.');
    }
    return lastResponse;
  }

  private async deleteFileById(fileId: string): Promise<void> {
    const response = await this.request('DELETE', this.buildFilePath(fileId));
    if (response.status === 404) return;
    if (!response.ok) {
      throw await buildError(response, 'delete file');
    }
  }

  private async saveMetadata(
    fileId: string,
    pointer: BlobPointer,
    values: { contentType: string; cacheControl?: string; metadata?: Record<string, string>; updatedAt?: string }
  ): Promise<void> {
    if (!this.metadataDocumentsPath) return;
    const documentId = toMetadataDocumentId(fileId);
    const data = {
      fileId,
      bucket: pointer.bucket,
      key: pointer.key,
      contentType: values.contentType,
      cacheControl: values.cacheControl ?? '',
      metadataJson: values.metadata ? JSON.stringify(values.metadata) : '',
      updatedAt: values.updatedAt ?? new Date().toISOString()
    };
    const createResponse = await this.request('POST', this.metadataDocumentsPath, {
      json: {
        documentId,
        data
      }
    });
    if (createResponse.ok) return;
    if (createResponse.status !== 409) {
      throw await buildError(createResponse, 'create blob metadata');
    }
    const updateResponse = await this.request(
      'PATCH',
      `${this.metadataDocumentsPath}/${encodeURIComponent(documentId)}`,
      {
        json: {
          data
        }
      }
    );
    if (!updateResponse.ok) {
      throw await buildError(updateResponse, 'update blob metadata');
    }
  }

  private async readMetadata(fileId: string, pointer: BlobPointer): Promise<BlobMetadataRecord | null> {
    if (!this.metadataDocumentsPath) return null;
    try {
      const documentId = toMetadataDocumentId(fileId);
      const response = await this.request(
        'GET',
        `${this.metadataDocumentsPath}/${encodeURIComponent(documentId)}`
      );
      if (response.status === 404) return null;
      if (!response.ok) return null;
      const document = (await response.json()) as BlobMetadataDocument;
      if (document.bucket !== pointer.bucket || document.key !== pointer.key) {
        return null;
      }
      return {
        contentType: parseString(document.contentType),
        cacheControl: parseString(document.cacheControl),
        metadata: parseMetadataMap(document.metadataJson),
        updatedAt: parseTimestamp(document.updatedAt)
      };
    } catch {
      return null;
    }
  }

  private async deleteMetadata(fileId: string): Promise<void> {
    if (!this.metadataDocumentsPath) return;
    const documentId = toMetadataDocumentId(fileId);
    try {
      const response = await this.request(
        'DELETE',
        `${this.metadataDocumentsPath}/${encodeURIComponent(documentId)}`
      );
      if (response.status === 404) return;
      if (!response.ok) {
        throw await buildError(response, 'delete blob metadata');
      }
    } catch {
      // Metadata is best-effort to avoid breaking file deletion semantics.
    }
  }

  async put(input: BlobWriteInput): Promise<BlobPointer> {
    const bucket = normalizeBlobBucket(input.bucket);
    const key = normalizeBlobKey(input.key);
    const fileId = toFileId(bucket, key, this.config.keyPrefix);
    const namespacedKey = toNamespaceKey(bucket, key, this.config.keyPrefix);
    const fileName = path.posix.basename(namespacedKey) || `${fileId}.bin`;
    const contentType = input.contentType || 'application/octet-stream';

    let uploadResponse = await this.uploadFile(fileId, input.bytes, contentType, fileName);
    if (uploadResponse.status === 409 && this.config.upsert) {
      await this.deleteFileById(fileId);
      uploadResponse = await this.uploadFile(fileId, input.bytes, contentType, fileName);
    }
    if (!uploadResponse.ok) {
      throw await buildError(uploadResponse, 'upload file');
    }

    let updatedAt: string | undefined;
    try {
      const body = (await uploadResponse.clone().json()) as AppwriteFileMetadata;
      updatedAt = parseTimestamp(body.$updatedAt);
    } catch {
      updatedAt = new Date().toISOString();
    }

    try {
      await this.saveMetadata(
        fileId,
        { bucket, key },
        {
          contentType,
          cacheControl: input.cacheControl,
          metadata: input.metadata,
          updatedAt
        }
      );
    } catch {
      // Metadata persistence is optional and should not fail file writes.
    }
    return { bucket, key };
  }

  async get(pointer: BlobPointer): Promise<BlobReadResult | null> {
    const bucket = normalizeBlobBucket(pointer.bucket);
    const key = normalizeBlobKey(pointer.key);
    const fileId = toFileId(bucket, key, this.config.keyPrefix);
    const metadataResponse = await this.request('GET', this.buildFilePath(fileId));
    if (metadataResponse.status === 404) return null;
    if (!metadataResponse.ok) {
      throw await buildError(metadataResponse, 'read file metadata');
    }
    const fileMetadata = (await metadataResponse.json()) as AppwriteFileMetadata;
    const viewResponse = await this.request('GET', `${this.buildFilePath(fileId)}/view`);
    if (viewResponse.status === 404) return null;
    if (!viewResponse.ok) {
      throw await buildError(viewResponse, 'read file bytes');
    }
    const buffer = await viewResponse.arrayBuffer();
    const metadataRecord = await this.readMetadata(fileId, { bucket, key });
    return {
      bucket,
      key,
      bytes: new Uint8Array(buffer),
      contentType:
        metadataRecord?.contentType ??
        parseString(fileMetadata.mimeType) ??
        viewResponse.headers.get('content-type') ??
        'application/octet-stream',
      cacheControl: metadataRecord?.cacheControl,
      metadata: metadataRecord?.metadata,
      updatedAt: metadataRecord?.updatedAt ?? parseTimestamp(fileMetadata.$updatedAt)
    };
  }

  async delete(pointer: BlobPointer): Promise<void> {
    const bucket = normalizeBlobBucket(pointer.bucket);
    const key = normalizeBlobKey(pointer.key);
    const fileId = toFileId(bucket, key, this.config.keyPrefix);
    await this.deleteFileById(fileId);
    await this.deleteMetadata(fileId);
  }
}
