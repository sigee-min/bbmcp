import assert from 'node:assert/strict';
import { PostgresDbBlobStore } from '@ashfox/gateway-persistence/infrastructure/PostgresDbBlobStore';
import type { PostgresPool } from '@ashfox/gateway-persistence/infrastructure/PostgresProjectRepository';
import { registerAsync } from './helpers';

type StoredBlobRow = {
  bucket: string;
  key: string;
  bytes: Uint8Array;
  content_type: string;
  cache_control: string | null;
  metadata_json: Record<string, string> | null;
  updated_at: string;
};

class FakePostgresBlobPool implements PostgresPool {
  readonly records = new Map<string, StoredBlobRow>();
  readonly queries: string[] = [];
  closed = false;

  private toKey(bucket: string, key: string): string {
    return `${bucket}::${key}`;
  }

  private toRows<TResult extends Record<string, unknown>>(rows: Record<string, unknown>[]): { rows: TResult[] } {
    return { rows: rows as TResult[] };
  }

  async query<TResult extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: unknown[] = []
  ): Promise<{ rows: TResult[] }> {
    const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
    this.queries.push(normalized);

    if (normalized.startsWith('create schema if not exists')) {
      return { rows: [] };
    }
    if (normalized.startsWith('create table if not exists') && normalized.includes('bytes bytea not null')) {
      return { rows: [] };
    }
    if (normalized.startsWith('insert into') && normalized.includes('on conflict (bucket, key)')) {
      const [bucket, key, bytes, contentType, cacheControl, metadataJson] = params as [
        string,
        string,
        Uint8Array,
        string,
        string | null,
        string | null
      ];
      const record: StoredBlobRow = {
        bucket,
        key,
        bytes: Buffer.from(bytes),
        content_type: contentType,
        cache_control: cacheControl ?? null,
        metadata_json: metadataJson ? (JSON.parse(metadataJson) as Record<string, string>) : null,
        updated_at: new Date().toISOString()
      };
      this.records.set(this.toKey(bucket, key), record);
      return { rows: [] };
    }
    if (normalized.startsWith('select bucket, key, bytes') && normalized.includes('where bucket = $1')) {
      const bucket = String(params[0]);
      const key = String(params[1]);
      const found = this.records.get(this.toKey(bucket, key));
      return this.toRows<TResult>(found ? [found as unknown as Record<string, unknown>] : []);
    }
    if (normalized.startsWith('delete from') && normalized.includes('where bucket = $1')) {
      const bucket = String(params[0]);
      const key = String(params[1]);
      this.records.delete(this.toKey(bucket, key));
      return { rows: [] };
    }
    throw new Error(`Unhandled SQL in fake blob pool: ${text}`);
  }

  async end(): Promise<void> {
    this.closed = true;
  }
}

registerAsync(
  (async () => {
    const fakePool = new FakePostgresBlobPool();
    const blobStore = new PostgresDbBlobStore({
      connectionString: 'postgresql://fake',
      schema: 'public',
      tableName: 'ashfox_blobs',
      maxConnections: 1,
      provider: 'postgres',
      host: 'localhost',
      poolFactory: () => fakePool
    });

    await blobStore.put({
      bucket: 'assets',
      key: 'models/demo.json',
      bytes: Buffer.from('{"ok":true}', 'utf8'),
      contentType: 'application/json',
      cacheControl: 'max-age=60',
      metadata: { source: 'unit' }
    });

    const firstRead = await blobStore.get({
      bucket: 'assets',
      key: 'models/demo.json'
    });
    assert.ok(firstRead);
    assert.equal(firstRead?.contentType, 'application/json');
    assert.equal(firstRead?.cacheControl, 'max-age=60');
    assert.equal(Buffer.from(firstRead?.bytes ?? []).toString('utf8'), '{"ok":true}');
    assert.deepEqual(firstRead?.metadata, { source: 'unit' });

    await blobStore.put({
      bucket: 'assets',
      key: 'models/demo.json',
      bytes: Buffer.from('{"ok":false}', 'utf8'),
      contentType: 'application/json'
    });
    const secondRead = await blobStore.get({
      bucket: 'assets',
      key: 'models/demo.json'
    });
    assert.equal(Buffer.from(secondRead?.bytes ?? []).toString('utf8'), '{"ok":false}');
    assert.equal(secondRead?.cacheControl, undefined);
    assert.equal(secondRead?.metadata, undefined);

    await blobStore.delete({
      bucket: 'assets',
      key: 'models/demo.json'
    });
    const afterDelete = await blobStore.get({
      bucket: 'assets',
      key: 'models/demo.json'
    });
    assert.equal(afterDelete, null);

    await blobStore.close();
    assert.equal(fakePool.closed, true);

    assert.throws(
      () =>
        new PostgresDbBlobStore({
          connectionString: 'postgresql://fake',
          schema: 'public',
          tableName: 'invalid-table-name',
          maxConnections: 1,
          provider: 'postgres',
          host: 'localhost',
          poolFactory: () => fakePool
        }),
      /table must match/
    );
  })()
);
