import assert from 'node:assert/strict';
import { createGatewayPersistence } from '@ashfox/gateway-persistence/createPersistence';
import { registerAsync } from './helpers';

registerAsync(
  (async () => {
    {
      const persistence = createGatewayPersistence(
        {
          ASHFOX_PERSISTENCE_PRESET: 'local'
        },
        { failFast: false }
      );
      assert.equal(typeof persistence.health.database.ready, 'boolean');
    }

    {
      assert.throws(
        () =>
          createGatewayPersistence(
            {
              ASHFOX_PERSISTENCE_PRESET: 'appwrite'
            },
            { failFast: true }
          ),
        /Persistence startup validation failed/
      );
    }

    {
      assert.throws(
        () =>
          createGatewayPersistence(
            {
              ASHFOX_PERSISTENCE_PRESET: 'ashfox',
              ASHFOX_DB_ASHFOX_URL: 'postgresql://postgres:secret@database.sigee.xyx:5432/postgres?sslmode=require'
            },
            { failFast: true }
          ),
        /Persistence startup validation failed/
      );
    }

    {
      const persistence = createGatewayPersistence({
        ASHFOX_PERSISTENCE_PRESET: 'local',
        ASHFOX_DB_PROVIDER: 'postgres',
        ASHFOX_STORAGE_PROVIDER: 's3'
      });
      assert.equal(persistence.health.selection.preset, 'local');
      assert.equal(persistence.health.selection.databaseProvider, 'sqlite');
      assert.equal(persistence.health.selection.storageProvider, 'db');
    }
  })()
);
