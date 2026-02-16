import { NextResponse } from 'next/server';

import { getNativePipelineStore } from '../../../../../lib/nativePipelineStore';

export const dynamic = 'force-dynamic';

type SubmitJobBody = {
  kind?: unknown;
  payload?: unknown;
  maxAttempts?: unknown;
  leaseMs?: unknown;
};

type ParsedPositiveInt =
  | {
      ok: true;
      value?: number;
    }
  | {
      ok: false;
    };

const parseOptionalPositiveInt = (value: unknown): ParsedPositiveInt => {
  if (value === undefined) return { ok: true };
  if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false };
  if (!Number.isInteger(value) || value <= 0) return { ok: false };
  return { ok: true, value };
};

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      projectId: string;
    }>;
  }
) {
  const { projectId } = await context.params;
  const store = getNativePipelineStore();
  const project = await store.getProject(projectId);
  if (!project) {
    return NextResponse.json(
      {
        ok: false,
        code: 'project_load_failed',
        message: `Project not found: ${projectId}`
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    jobs: await store.listProjectJobs(projectId)
  });
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      projectId: string;
    }>;
  }
) {
  const { projectId } = await context.params;
  const store = getNativePipelineStore();

  let body: SubmitJobBody;
  try {
    body = (await request.json()) as SubmitJobBody;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: 'invalid_payload',
        message: 'JSON body is required'
      },
      { status: 400 }
    );
  }

  if (typeof body.kind !== 'string' || body.kind.trim().length === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: 'invalid_payload',
        message: 'kind is required'
      },
      { status: 400 }
    );
  }
  const normalizedKind = body.kind.trim();

  const parsedMaxAttempts = parseOptionalPositiveInt(body.maxAttempts);
  if (!parsedMaxAttempts.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: 'invalid_payload',
        message: 'maxAttempts must be a positive integer'
      },
      { status: 400 }
    );
  }

  const parsedLeaseMs = parseOptionalPositiveInt(body.leaseMs);
  if (!parsedLeaseMs.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: 'invalid_payload',
        message: 'leaseMs must be a positive integer'
      },
      { status: 400 }
    );
  }

  if (body.payload !== undefined && !isRecord(body.payload)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'invalid_payload',
        message: 'payload must be an object'
      },
      { status: 400 }
    );
  }

  const job = await store.submitJob({
    projectId,
    kind: normalizedKind,
    payload: body.payload,
    maxAttempts: parsedMaxAttempts.value,
    leaseMs: parsedLeaseMs.value
  });

  return NextResponse.json({ ok: true, job }, { status: 202 });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
