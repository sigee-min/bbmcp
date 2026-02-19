import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BlobPointer, BlobReadResult, BlobStore, BlobWriteInput } from '@ashfox/backend-core';
import type { SqliteDbBlobStoreConfig } from '../config';
import { toStoragePointer } from './blobKey';
import { quoteSqlIdentifier } from './validation';

type SqliteStatement = {
  run: (...params: unknown[]) => unknown;
  get: (...params: unknown[]) => unknown;
};

type SqliteDatabase = {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
};

type DatabaseSyncConstructor = new (location: string) => SqliteDatabase;

type SqliteBlobRow = {
  bucket: string;
  key: string;
  bytes: Uint8Array;
  content_type: string;
  cache_control: string | null;
  metadata_json: string | null;
  updated_at: string;
};

const ensureIso = (value: unknown): string => {
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

const parseMetadata = (value: string | null): Record<string, string> | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return undefined;
    const metadata: Record<string, string> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (typeof entry === 'string') {
        metadata[key] = entry;
      }
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  } catch {
    return undefined;
  }
};

const toBytes = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof value === 'string') return Buffer.from(value);
  return new Uint8Array();
};

const loadDatabaseConstructor = (): DatabaseSyncConstructor => {
  type SqliteModule = DatabaseSyncConstructor | { default?: DatabaseSyncConstructor };
  const sqliteModule = require('better-sqlite3') as SqliteModule;
  const constructor = typeof sqliteModule === 'function' ? sqliteModule : sqliteModule.default;
  if (typeof constructor !== 'function') {
    throw new Error('better-sqlite3 Database API is unavailable.');
  }
  return constructor;
};

export class SqliteDbBlobStore implements BlobStore {
  private readonly filePath: string;
  private readonly tableSql: string;
  private database: SqliteDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(config: SqliteDbBlobStoreConfig) {
    this.filePath = path.resolve(config.filePath);
    this.tableSql = quoteSqlIdentifier(config.tableName, 'table');
  }

  private getDatabase(): SqliteDatabase {
    if (this.database) return this.database;
    const Database = loadDatabaseConstructor();
    this.database = new Database(this.filePath);
    return this.database;
  }

  private async ensureInitialized(): Promise<SqliteDatabase> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const db = this.getDatabase();
        db.exec(`
          CREATE TABLE IF NOT EXISTS ${this.tableSql} (
            bucket TEXT NOT NULL,
            key TEXT NOT NULL,
            bytes BLOB NOT NULL,
            content_type TEXT NOT NULL,
            cache_control TEXT,
            metadata_json TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (bucket, key)
          )
        `);
      })();
    }
    await this.initPromise;
    return this.getDatabase();
  }

  async put(input: BlobWriteInput): Promise<BlobPointer> {
    const db = await this.ensureInitialized();
    const { bucket, key } = toStoragePointer(input, undefined);
    const metadata = sanitizeMetadata(input.metadata);
    db.prepare(
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
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (bucket, key)
        DO UPDATE
        SET bytes = excluded.bytes,
            content_type = excluded.content_type,
            cache_control = excluded.cache_control,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
      `
    ).run(
      bucket,
      key,
      Buffer.from(input.bytes),
      input.contentType || 'application/octet-stream',
      input.cacheControl ?? null,
      metadata ? JSON.stringify(metadata) : null,
      new Date().toISOString()
    );
    return { bucket, key };
  }

  async get(pointer: BlobPointer): Promise<BlobReadResult | null> {
    const db = await this.ensureInitialized();
    const { bucket, key } = toStoragePointer(pointer, undefined);
    const row = db
      .prepare(
        `
          SELECT bucket, key, bytes, content_type, cache_control, metadata_json, updated_at
          FROM ${this.tableSql}
          WHERE bucket = ?
            AND key = ?
          LIMIT 1
        `
      )
      .get(bucket, key) as SqliteBlobRow | undefined;
    if (!row) return null;
    return {
      bucket: row.bucket,
      key: row.key,
      bytes: toBytes(row.bytes),
      contentType: row.content_type || 'application/octet-stream',
      cacheControl: row.cache_control ?? undefined,
      metadata: parseMetadata(row.metadata_json),
      updatedAt: ensureIso(row.updated_at)
    };
  }

  async delete(pointer: BlobPointer): Promise<void> {
    const db = await this.ensureInitialized();
    const { bucket, key } = toStoragePointer(pointer, undefined);
    db.prepare(
      `
        DELETE FROM ${this.tableSql}
        WHERE bucket = ?
          AND key = ?
      `
    ).run(bucket, key);
  }

  async close(): Promise<void> {
    if (!this.database) return;
    const current = this.database;
    this.database = null;
    this.initPromise = null;
    current.close();
  }
}
