import assert from 'node:assert/strict';
import type { PersistedProjectRecord } from '@ashfox/backend-core';
import { PostgresProjectRepository, type PostgresPool } from '../src/persistence/infrastructure/PostgresProjectRepository';
import { registerAsync } from './helpers';

type StoredRow = {
  tenant_id: string;
  project_id: string;
  revision: string;
  state: unknown;
  created_at: string;
  updated_at: string;
};

class FakePostgresPool implements PostgresPool {
  readonly migrations = new Map<number, string>();
  readonly records = new Map<string, StoredRow>();
  readonly queries: string[] = [];
  closed = false;

  private key(tenantId: string, projectId: string): string {
    return `${tenantId}::${projectId}`;
  }

  private toResultRows<TResult extends Record<string, unknown>>(rows: Record<string, unknown>[]): { rows: TResult[] } {
    return { rows: rows as TResult[] };
  }

  async query<TResult extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params: unknown[] = []
  ): Promise<{ rows: TResult[] }> {
    const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
    this.queries.push(normalized);

    if (normalized.startsWith('begin') || normalized.startsWith('commit') || normalized.startsWith('rollback')) {
      return { rows: [] };
    }
    if (normalized.startsWith('create schema if not exists')) {
      return { rows: [] };
    }
    if (normalized.startsWith('create table if not exists') && normalized.includes('ashfox_schema_migrations')) {
      return { rows: [] };
    }
    if (normalized.startsWith('select version from') && normalized.includes('ashfox_schema_migrations')) {
      const rows = Array.from(this.migrations.keys()).map((version) => ({ version }));
      return this.toResultRows<TResult>(rows);
    }
    if (normalized.startsWith('insert into') && normalized.includes('ashfox_schema_migrations')) {
      const version = Number(params[0]);
      const name = String(params[1]);
      if (!this.migrations.has(version)) {
        this.migrations.set(version, name);
      }
      return { rows: [] };
    }
    if (normalized.startsWith('create table if not exists') && normalized.includes('tenant_id text not null')) {
      return { rows: [] };
    }
    if (normalized.startsWith('select tenant_id') && normalized.includes('where tenant_id = $1')) {
      const tenantId = String(params[0]);
      const projectId = String(params[1]);
      const found = this.records.get(this.key(tenantId, projectId));
      return this.toResultRows<TResult>(found ? [found] : []);
    }
    if (normalized.startsWith('insert into') && normalized.includes('do nothing') && normalized.includes('returning 1 as applied')) {
      const [tenantId, projectId, revision, stateJson, createdAt, updatedAt] = params as string[];
      const key = this.key(tenantId, projectId);
      if (this.records.has(key)) {
        return { rows: [] };
      }
      this.records.set(key, {
        tenant_id: tenantId,
        project_id: projectId,
        revision,
        state: JSON.parse(stateJson) as unknown,
        created_at: createdAt,
        updated_at: updatedAt
      });
      return this.toResultRows<TResult>([{ applied: 1 }]);
    }
    if (normalized.startsWith('insert into') && normalized.includes('on conflict (tenant_id, project_id)')) {
      const [tenantId, projectId, revision, stateJson, createdAt, updatedAt] = params as string[];
      const key = this.key(tenantId, projectId);
      const existing = this.records.get(key);
      const state = JSON.parse(stateJson) as unknown;
      if (existing) {
        existing.revision = revision;
        existing.state = state;
        existing.updated_at = updatedAt;
      } else {
        this.records.set(key, {
          tenant_id: tenantId,
          project_id: projectId,
          revision,
          state,
          created_at: createdAt,
          updated_at: updatedAt
        });
      }
      return { rows: [] };
    }
    if (normalized.startsWith('update') && normalized.includes('and revision = $6') && normalized.includes('returning 1 as applied')) {
      const [tenantId, projectId, revision, stateJson, updatedAt, expectedRevision] = params as string[];
      const key = this.key(tenantId, projectId);
      const existing = this.records.get(key);
      if (!existing || existing.revision !== expectedRevision) {
        return { rows: [] };
      }
      existing.revision = revision;
      existing.state = JSON.parse(stateJson) as unknown;
      existing.updated_at = updatedAt;
      return this.toResultRows<TResult>([{ applied: 1 }]);
    }
    if (normalized.startsWith('delete from') && normalized.includes('where tenant_id = $1')) {
      const tenantId = String(params[0]);
      const projectId = String(params[1]);
      this.records.delete(this.key(tenantId, projectId));
      return { rows: [] };
    }
    throw new Error(`Unhandled SQL in fake pool: ${text}`);
  }

  async end(): Promise<void> {
    this.closed = true;
  }
}

registerAsync(
  (async () => {
    const fakePool = new FakePostgresPool();
    const repository = new PostgresProjectRepository({
      connectionString: 'postgresql://fake',
      schema: 'public',
      tableName: 'ashfox_projects',
      migrationsTableName: 'ashfox_schema_migrations',
      maxConnections: 1,
      poolFactory: () => fakePool
    });

    const record: PersistedProjectRecord = {
      scope: {
        tenantId: 'tenant-postgres',
        projectId: 'project-postgres'
      },
      revision: 'rev-1',
      state: { ok: true },
      createdAt: '2026-02-09T00:00:00.000Z',
      updatedAt: '2026-02-09T00:00:00.000Z'
    };

    await repository.save(record);
    assert.equal(fakePool.migrations.get(1), 'create_projects_table');

    const firstRead = await repository.find(record.scope);
    assert.ok(firstRead);
    assert.equal(firstRead?.revision, 'rev-1');
    assert.deepEqual(firstRead?.state, { ok: true });

    await repository.save({
      ...record,
      revision: 'rev-2',
      state: { ok: false },
      updatedAt: '2026-02-09T01:00:00.000Z'
    });
    const secondRead = await repository.find(record.scope);
    assert.equal(secondRead?.revision, 'rev-2');
    assert.equal(secondRead?.createdAt, '2026-02-09T00:00:00.000Z');
    assert.equal(secondRead?.updatedAt, '2026-02-09T01:00:00.000Z');

    const mismatchResult = await repository.saveIfRevision(
      {
        ...record,
        revision: 'rev-3',
        state: { ok: 'mismatch' },
        updatedAt: '2026-02-09T02:00:00.000Z'
      },
      'wrong-revision'
    );
    assert.equal(mismatchResult, false);

    const guardedUpdateResult = await repository.saveIfRevision(
      {
        ...record,
        revision: 'rev-3',
        state: { ok: 'guarded' },
        updatedAt: '2026-02-09T03:00:00.000Z'
      },
      'rev-2'
    );
    assert.equal(guardedUpdateResult, true);
    const guardedRead = await repository.find(record.scope);
    assert.equal(guardedRead?.revision, 'rev-3');

    const guardedCreateFail = await repository.saveIfRevision(
      {
        ...record,
        revision: 'rev-4',
        state: { ok: 'already-exists' },
        updatedAt: '2026-02-09T04:00:00.000Z'
      },
      null
    );
    assert.equal(guardedCreateFail, false);

    await repository.remove(record.scope);
    const afterDelete = await repository.find(record.scope);
    assert.equal(afterDelete, null);

    const guardedCreateSuccess = await repository.saveIfRevision(
      {
        ...record,
        revision: 'rev-created',
        state: { ok: 'created' },
        updatedAt: '2026-02-09T05:00:00.000Z'
      },
      null
    );
    assert.equal(guardedCreateSuccess, true);
    const recreated = await repository.find(record.scope);
    assert.equal(recreated?.revision, 'rev-created');

    await repository.close();
    assert.equal(fakePool.closed, true);

    assert.throws(
      () =>
        new PostgresProjectRepository({
          connectionString: 'postgresql://fake',
          schema: 'bad-schema-name',
          tableName: 'ashfox_projects',
          migrationsTableName: 'ashfox_schema_migrations',
          maxConnections: 1,
          poolFactory: () => fakePool
        }),
      /schema must match/
    );
  })()
);
