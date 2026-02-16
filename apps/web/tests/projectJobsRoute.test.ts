import assert from 'node:assert/strict';

import { GET, POST } from '../src/app/api/projects/[projectId]/jobs/route';

module.exports = async () => {
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
