import assert from 'node:assert/strict';

import { GET } from '../src/app/api/projects/route';

module.exports = async () => {
  {
    const response = await GET(new Request('http://localhost/api/projects'));
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok?: boolean; projects?: Array<{ name?: string }> };
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.projects));
    assert.ok((body.projects?.length ?? 0) >= 1);
  }

  {
    const response = await GET(new Request('http://localhost/api/projects?q=lynx'));
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok?: boolean; projects?: Array<{ name?: string }> };
    assert.equal(body.ok, true);
    assert.equal(body.projects?.length, 1);
    assert.equal(body.projects?.[0]?.name, 'Desert Lynx');
  }
};
