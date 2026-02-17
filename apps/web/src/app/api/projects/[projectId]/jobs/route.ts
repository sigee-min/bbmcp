import { NextResponse } from 'next/server';
import {
  NativeJobContractError,
  type NativeJobSubmitInput,
  type SupportedNativeJobKind,
  normalizeNativeJobPayload,
  normalizeSupportedNativeJobKind
} from '@ashfox/native-pipeline/types';

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

  const listProjectJobs = store.listProjectJobs;
  if (typeof listProjectJobs !== 'function') {
    return NextResponse.json(
      {
        ok: false,
        code: 'invalid_state',
        message: 'Project job listing is unavailable for the active queue backend.'
      },
      { status: 501 }
    );
  }

  return NextResponse.json({
    ok: true,
    jobs: await listProjectJobs.call(store, projectId)
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

  let normalizedKind: SupportedNativeJobKind;
  try {
    normalizedKind = normalizeSupportedNativeJobKind(body.kind);
  } catch (error) {
    if (error instanceof NativeJobContractError) {
      return NextResponse.json(
        {
          ok: false,
          code: 'invalid_payload',
          message: error.message
        },
        { status: 400 }
      );
    }
    throw error;
  }

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

  let normalizedPayload: NativeJobSubmitInput['payload'];
  try {
    normalizedPayload = normalizeNativeJobPayload(normalizedKind, body.payload);
  } catch (error) {
    if (error instanceof NativeJobContractError) {
      return NextResponse.json(
        {
          ok: false,
          code: 'invalid_payload',
          message: error.message
        },
        { status: 400 }
      );
    }
    throw error;
  }

  try {
    const job = await store.submitJob({
      projectId,
      kind: normalizedKind,
      ...(normalizedPayload ? { payload: normalizedPayload } : {}),
      maxAttempts: parsedMaxAttempts.value,
      leaseMs: parsedLeaseMs.value
    });

    return NextResponse.json({ ok: true, job }, { status: 202 });
  } catch (error) {
    if (error instanceof NativeJobContractError) {
      return NextResponse.json(
        {
          ok: false,
          code: 'invalid_payload',
          message: error.message
        },
        { status: 400 }
      );
    }
    throw error;
  }
}
