import type { BlobPointer, BlobReadResult, BlobStore, BlobWriteInput } from '@ashfox/backend-core';
import type { AshfoxBlobStoreConfig } from '../config';
import { fromStorageKey, toStoragePointer } from './blobKey';

export interface AshfoxStorageBlobStoreOptions {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}

const encodePath = (value: string): string =>
  value
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const parseMetadata = (headerValue: string | null): Record<string, string> | undefined => {
  if (!headerValue) return undefined;
  try {
    const parsed = JSON.parse(headerValue) as unknown;
    if (!parsed || typeof parsed !== 'object') return undefined;
    const entries = Object.entries(parsed as Record<string, unknown>);
    const metadata: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (typeof value === 'string') metadata[key] = value;
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  } catch {
    return undefined;
  }
};

const buildError = async (response: Response): Promise<Error> => {
  let reason = `${response.status} ${response.statusText}`;
  try {
    const text = (await response.text()).trim();
    if (text) reason = `${reason} :: ${text.slice(0, 300)}`;
  } catch {
    // ignore response parsing errors in error construction.
  }
  return new Error(`Ashfox storage request failed: ${reason}`);
};

export class AshfoxStorageBlobStore implements BlobStore {
  private readonly config: AshfoxBlobStoreConfig;
  private readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;

  constructor(config: AshfoxBlobStoreConfig, options: AshfoxStorageBlobStoreOptions = {}) {
    this.config = config;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(
    method: 'GET' | 'POST' | 'DELETE',
    pointer: BlobPointer,
    options?: { body?: Uint8Array; contentType?: string; cacheControl?: string }
  ): Promise<Response> {
    const { bucket, storageKey } = toStoragePointer(pointer, this.config.keyPrefix);
    const url = `${this.config.baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodePath(storageKey)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const headers = new Headers({
        authorization: `Bearer ${this.config.serviceKey}`,
        apikey: this.config.serviceKey
      });
      if (method === 'POST') {
        headers.set('content-type', options?.contentType ?? 'application/octet-stream');
        headers.set('x-upsert', this.config.upsert ? 'true' : 'false');
        if (options?.cacheControl) headers.set('cache-control', options.cacheControl);
      }
      return await this.fetchImpl(url, {
        method,
        headers,
        body: options?.body ? Buffer.from(options.body) : undefined,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  async put(input: BlobWriteInput): Promise<BlobPointer> {
    const { bucket, key } = toStoragePointer(input, this.config.keyPrefix);
    const response = await this.request('POST', { bucket, key }, {
      body: input.bytes,
      contentType: input.contentType,
      cacheControl: input.cacheControl
    });
    if (!response.ok) {
      throw await buildError(response);
    }
    return { bucket, key };
  }

  async get(pointer: BlobPointer): Promise<BlobReadResult | null> {
    const { bucket, key, storageKey } = toStoragePointer(pointer, this.config.keyPrefix);
    const response = await this.request('GET', { bucket, key });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw await buildError(response);
    }
    const buffer = await response.arrayBuffer();
    return {
      bucket,
      key: fromStorageKey(storageKey, this.config.keyPrefix),
      bytes: new Uint8Array(buffer),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      cacheControl: response.headers.get('cache-control') ?? undefined,
      metadata: parseMetadata(response.headers.get('x-ashfox-metadata')),
      updatedAt: response.headers.get('last-modified') ?? undefined
    };
  }

  async delete(pointer: BlobPointer): Promise<void> {
    const { bucket, key } = toStoragePointer(pointer, this.config.keyPrefix);
    const response = await this.request('DELETE', { bucket, key });
    if (response.status === 404) return;
    if (!response.ok) {
      throw await buildError(response);
    }
  }
}
