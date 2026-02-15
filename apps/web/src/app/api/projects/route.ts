import { NextResponse } from 'next/server';

import { getNativePipelineStore } from '../../../lib/nativePipelineStore';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? undefined;
  const store = getNativePipelineStore();
  return NextResponse.json({
    ok: true,
    projects: store.listProjects(query)
  });
}
