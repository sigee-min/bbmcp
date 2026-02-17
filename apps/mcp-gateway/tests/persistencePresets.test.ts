import assert from 'node:assert/strict';
import { createGatewayPersistence } from '../src/persistence/createPersistence';
import { registerAsync } from './helpers';

const getDetails = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
};

registerAsync(
  (async () => {
    {
      const persistence = createGatewayPersistence({
        ASHFOX_PERSISTENCE_PRESET: 'local'
      });
      assert.deepEqual(persistence.health.selection, {
        preset: 'local',
        databaseProvider: 'sqlite',
        storageProvider: 'db'
      });
      assert.equal(persistence.health.database.ready, true);
      assert.equal(persistence.health.storage.ready, true);
      const dbDetails = getDetails(persistence.health.database.details);
      assert.equal(dbDetails.adapter, 'sqlite_repository');
      assert.ok(typeof dbDetails.filePath === 'string' && dbDetails.filePath.length > 0);
      const storageDetails = getDetails(persistence.health.storage.details);
      assert.equal(storageDetails.adapter, 'sqlite_database_blob_store');
      assert.ok(typeof storageDetails.filePath === 'string' && storageDetails.filePath.length > 0);
    }

    {
      const persistence = createGatewayPersistence({
        ASHFOX_PERSISTENCE_PRESET: 'local',
        ASHFOX_DB_PROVIDER: 'postgres',
        ASHFOX_STORAGE_PROVIDER: 's3'
      });
      assert.deepEqual(persistence.health.selection, {
        preset: 'local',
        databaseProvider: 'sqlite',
        storageProvider: 'db'
      });
    }

    {
      const persistence = createGatewayPersistence({
        ASHFOX_PERSISTENCE_PRESET: 'selfhost',
        ASHFOX_DB_POSTGRES_URL: 'postgresql://selfhost:selfhost@127.0.0.1:5432/ashfox'
      });
      assert.deepEqual(persistence.health.selection, {
        preset: 'selfhost',
        databaseProvider: 'postgres',
        storageProvider: 'db'
      });
      assert.equal(persistence.health.database.ready, true);
      assert.equal(persistence.health.storage.ready, true);
      const details = getDetails(persistence.health.storage.details);
      assert.equal(details.adapter, 'postgres_database_blob_store');
    }

    {
      const persistence = createGatewayPersistence({
        ASHFOX_PERSISTENCE_PRESET: 'ashfox',
        ASHFOX_DB_ASHFOX_URL: 'postgresql://postgres:secret@database.sigee.xyx:5432/postgres?sslmode=require',
        ASHFOX_STORAGE_ASHFOX_URL: 'https://database.sigee.xyx',
        ASHFOX_STORAGE_ASHFOX_SERVICE_KEY: 'service-role-test-key'
      });
      assert.deepEqual(persistence.health.selection, {
        preset: 'ashfox',
        databaseProvider: 'ashfox',
        storageProvider: 'ashfox'
      });
      assert.equal(persistence.health.database.ready, true);
      assert.equal(persistence.health.storage.ready, true);
      assert.equal(getDetails(persistence.health.database.details).host, 'database.sigee.xyx');
      assert.equal(getDetails(persistence.health.storage.details).baseUrl, 'https://database.sigee.xyx');
    }

    {
      const persistence = createGatewayPersistence({
        ASHFOX_PERSISTENCE_PRESET: 'appwrite',
        ASHFOX_DB_APPWRITE_URL: 'https://cloud.appwrite.io/v1',
        ASHFOX_DB_APPWRITE_PROJECT_ID: 'demo-project',
        ASHFOX_DB_APPWRITE_API_KEY: 'demo-key',
        ASHFOX_DB_APPWRITE_DATABASE_ID: 'ashfox',
        ASHFOX_DB_APPWRITE_COLLECTION_ID: 'ashfox_projects',
        ASHFOX_STORAGE_APPWRITE_URL: 'https://cloud.appwrite.io/v1',
        ASHFOX_STORAGE_APPWRITE_PROJECT_ID: 'demo-project',
        ASHFOX_STORAGE_APPWRITE_API_KEY: 'demo-key',
        ASHFOX_STORAGE_APPWRITE_BUCKET_ID: 'ashfox_blobs'
      });
      assert.deepEqual(persistence.health.selection, {
        preset: 'appwrite',
        databaseProvider: 'appwrite',
        storageProvider: 'appwrite'
      });
      assert.equal(persistence.health.database.ready, true);
      assert.equal(persistence.health.storage.ready, true);
      assert.equal(getDetails(persistence.health.database.details).adapter, 'appwrite_databases');
      assert.equal(getDetails(persistence.health.storage.details).adapter, 'appwrite_storage');
    }

    {
      const persistence = createGatewayPersistence({
        ASHFOX_PERSISTENCE_PRESET: 'ashfox',
        ASHFOX_DB_ASHFOX_URL: 'postgresql://postgres:secret@database.sigee.xyx:5432/postgres?sslmode=require'
      });
      assert.equal(persistence.health.storage.ready, false);
      assert.equal(persistence.health.storage.reason, 'missing_credentials');
    }
  })()
);
