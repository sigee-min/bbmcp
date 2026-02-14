import { NextResponse } from 'next/server';

import { listProjects } from '../../../lib/mockProjectStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    projects: listProjects()
  });
}
