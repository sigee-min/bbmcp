import { NextResponse } from 'next/server';

export async function GET() {
  const queueBackend =
    String(process.env.ASHFOX_NATIVE_PIPELINE_BACKEND ?? 'persistence').trim().toLowerCase() === 'memory'
      ? 'memory'
      : 'persistence';

  return NextResponse.json({
    ok: true,
    service: 'ashfox-web',
    queueBackend,
    persistencePreset: String(process.env.ASHFOX_PERSISTENCE_PRESET ?? 'local').trim().toLowerCase(),
    timestamp: new Date().toISOString()
  });
}
