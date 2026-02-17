import { Pool } from 'pg';
import type { BlobPointer, BlobReadResult, BlobStore, BlobWriteInput } from '@ashfox/backend-core';
import type { PostgresDbBlobStoreConfig } from '../config';
import { toStoragePointer } from './blobKey';
import type { PostgresPool } from './PostgresProjectRepository';
import { quoteSqlIdentifier } from './validation';

export interface PostgresDbBlobStoreOptions extends PostgresDbBlobStoreConfig {
  poolFactory?: (options: { connectionString: string; maxConnections: number }) => PostgresPool;
}

type PostgresBlobRow = {
  bucket: string;
  key: string;
  bytes: Uint8Array;
  content_type: string;
  cache_control: string | null;
  metadata_json: unknown;
  updated_at: Date | string;
};

const normalizeTimestamp = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
};

const sanitizeMetadata = (value: Record<string, string> | undefined): Record<string, string> | undefined => {
  if (!value) return undefined;
  const metadata: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      metadata[key] = entry;
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const parseMetadata = (value: unknown): Record<string, string> | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      return parseMetadata(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== 'object') return undefined;
  const metadata: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') {
      metadata[key] = entry;
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
};

const toBytes = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof value === 'string') return Buffer.from(value);
  return new Uint8Array();
};

export class PostgresDbBlobStore implements BlobStore {
  private readonly options: PostgresDbBlobStoreOptions;
  private readonly schemaSql: string;
  private readonly tableSql: string;
  private pool: PostgresPool | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(options: PostgresDbBlobStoreOptions) {
    this.options = options;
    this.schemaSql = quoteSqlIdentifier(options.schema, 'schema');
    const tableNameSql = quoteSqlIdentifier(options.tableName, 'table');
    this.tableSql = `${this.schemaSql}.${tableNameSql}`;
  }

  private getPool(): PostgresPool {
    if (this.pool) return this.pool;
    this.pool = this.options.poolFactory
      ? this.options.poolFactory({
          connectionString: this.options.connectionString,
          maxConnections: this.options.maxConnections
        })
      : new Pool({
          connectionString: this.options.connectionString,
          max: this.options.maxConnections
        });
    return this.pool;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initializeSchema();
    }
    await this.initPromise;
  }

  private async initializeSchema(): Promise<void> {
    const pool = this.getPool();
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${this.schemaSql}`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableSql} (
        bucket TEXT NOT NULL,
        key TEXT NOT NULL,
        bytes BYTEA NOT NULL,
        content_type TEXT NOT NULL,
        cache_control TEXT,
        metadata_json JSONB,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (bucket, key)
      )
    `);
  }

  async put(input: BlobWriteInput): Promise<BlobPointer> {
    await this.ensureInitialized();
    const { bucket, key } = toStoragePointer(input, undefined);
    const pool = this.getPool();
    const metadata = sanitizeMetadata(input.metadata);
    await pool.query(
      `
        INSERT INTO ${this.tableSql} (
          bucket,
          key,
          bytes,
          content_type,
          cache_control,
          metadata_json,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
        ON CONFLICT (bucket, key)
        DO UPDATE
        SET bytes = EXCLUDED.bytes,
            content_type = EXCLUDED.content_type,
            cache_control = EXCLUDED.cache_control,
            metadata_json = EXCLUDED.metadata_json,
            updated_at = EXCLUDED.updated_at
      `,
      [
        bucket,
        key,
        Buffer.from(input.bytes),
        input.contentType || 'application/octet-stream',
        input.cacheControl ?? null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    return { bucket, key };
  }

  async get(pointer: BlobPointer): Promise<BlobReadResult | null> {
    await this.ensureInitialized();
    const { bucket, key } = toStoragePointer(pointer, undefined);
    const pool = this.getPool();
    const result = await pool.query<PostgresBlobRow>(
      `
        SELECT bucket, key, bytes, content_type, cache_control, metadata_json, updated_at
        FROM ${this.tableSql}
        WHERE bucket = $1
          AND key = $2
        LIMIT 1
      `,
      [bucket, key]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      bucket: row.bucket,
      key: row.key,
      bytes: toBytes(row.bytes),
      contentType: row.content_type || 'application/octet-stream',
      cacheControl: row.cache_control ?? undefined,
      metadata: parseMetadata(row.metadata_json),
      updatedAt: normalizeTimestamp(row.updated_at)
    };
  }

  async delete(pointer: BlobPointer): Promise<void> {
    await this.ensureInitialized();
    const { bucket, key } = toStoragePointer(pointer, undefined);
    const pool = this.getPool();
    await pool.query(
      `
        DELETE FROM ${this.tableSql}
        WHERE bucket = $1
          AND key = $2
      `,
      [bucket, key]
    );
  }

  async close(): Promise<void> {
    if (!this.pool) return;
    const current = this.pool;
    this.pool = null;
    this.initPromise = null;
    await current.end();
  }
}
