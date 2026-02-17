import assert from 'node:assert/strict';

import { GET, POST } from '../src/app/api/projects/[projectId]/jobs/route';
import { getNativePipelineStore } from '../src/lib/nativePipelineStore';

module.exports = async () => {
  const store = getNativePipelineStore();
  await store.reset();

  {
    const response = await GET(new Request('http://localhost/api/projects/missing/jobs'), {
      params: Promise.resolve({ projectId: 'missing' })
    });
    assert.equal(response.status, 404);
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'gltf.convert', maxAttempts: 5, leaseMs: 12000 })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 202);
    const body = (await response.json()) as {
      ok?: boolean;
      job?: { kind?: string; maxAttempts?: number; leaseMs?: number };
    };
    assert.equal(body.ok, true);
    assert.equal(body.job?.kind, 'gltf.convert');
    assert.equal(body.job?.maxAttempts, 5);
    assert.equal(body.job?.leaseMs, 12000);
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: '  gltf.convert  ' })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 202);
    const body = (await response.json()) as { job?: { kind?: string } };
    assert.equal(body.job?.kind, 'gltf.convert');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'custom.unsupported' })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'kind must be one of: gltf.convert, texture.preflight');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{bad json'
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'JSON body is required');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'kind is required');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'gltf.convert', maxAttempts: 0 })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'maxAttempts must be a positive integer');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'gltf.convert', maxAttempts: null })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'maxAttempts must be a positive integer');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'gltf.convert', maxAttempts: 1.5 })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'maxAttempts must be a positive integer');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'gltf.convert', leaseMs: '5000' })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'leaseMs must be a positive integer');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'gltf.convert', leaseMs: 1.5 })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'leaseMs must be a positive integer');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'gltf.convert', leaseMs: null })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'leaseMs must be a positive integer');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'gltf.convert', payload: ['bad'] })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'payload must be an object');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'gltf.convert', payload: { textureIds: ['atlas'] } })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'payload has unsupported field(s) for gltf.convert: textureIds');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'gltf.convert', payload: { sourceAssetId: 'asset-1' } })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'payload has unsupported field(s) for gltf.convert: sourceAssetId');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'texture.preflight', payload: { textureIds: ['atlas', ''] } })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { code?: string; message?: string };
    assert.equal(body.code, 'invalid_payload');
    assert.equal(body.message, 'payload.textureIds must be an array of non-empty strings');
  }

  {
    const response = await POST(
      new Request('http://localhost/api/projects/project-a/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'texture.preflight',
          payload: { textureIds: ['atlas'], maxDimension: 1024, allowNonPowerOfTwo: false }
        })
      }),
      {
        params: Promise.resolve({ projectId: 'project-a' })
      }
    );
    assert.equal(response.status, 202);
    const body = (await response.json()) as { job?: { kind?: string; payload?: { textureIds?: string[] } } };
    assert.equal(body.job?.kind, 'texture.preflight');
    assert.deepEqual(body.job?.payload?.textureIds, ['atlas']);
  }

  {
    const response = await GET(new Request('http://localhost/api/projects/project-a/jobs'), {
      params: Promise.resolve({ projectId: 'project-a' })
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok?: boolean; jobs?: Array<{ kind?: string }> };
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.jobs));
    assert.equal((body.jobs ?? []).some((job) => job.kind === 'gltf.convert'), true);
  }
};
