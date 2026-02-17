import { NextResponse } from 'next/server';
import { closeGatewayPersistence, createGatewayPersistence } from '@ashfox/mcp-gateway/persistence';

export async function GET() {
  const queueBackend =
    String(process.env.ASHFOX_NATIVE_PIPELINE_BACKEND ?? 'persistence').trim().toLowerCase() === 'memory'
      ? 'memory'
      : 'persistence';
  const persistencePreset = String(process.env.ASHFOX_PERSISTENCE_PRESET ?? 'local').trim().toLowerCase();
  const timestamp = new Date().toISOString();

  let persistence;
  try {
    persistence = createGatewayPersistence(process.env, { failFast: false });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: 'ashfox-web',
        queueBackend,
        persistencePreset,
        readiness: {
          availability: 'offline',
          reason: error instanceof Error ? error.message : String(error)
        },
        timestamp
      },
      { status: 503 }
    );
  }

  const readiness = persistence.health;
  const healthy = readiness.database.ready && readiness.storage.ready;
  await closeGatewayPersistence(persistence).catch(() => {});

  return NextResponse.json(
    {
      ok: healthy,
      service: 'ashfox-web',
      queueBackend,
      persistencePreset,
      readiness: {
        availability: healthy ? 'ready' : readiness.database.ready ? 'degraded' : 'offline',
        selection: readiness.selection,
        database: readiness.database,
        storage: readiness.storage
      },
      timestamp
    },
    { status: healthy ? 200 : 503 }
  );
}
