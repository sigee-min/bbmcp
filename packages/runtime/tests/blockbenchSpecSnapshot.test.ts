import assert from 'node:assert/strict';

import { BLOCKBENCH_SPEC_SNAPSHOT } from './support/sim/BlockbenchSpec';

const snapshot = BLOCKBENCH_SPEC_SNAPSHOT;

assert.equal(typeof snapshot.blockbench.version, 'string');
assert.equal(snapshot.blockbench.version.length > 0, true);
assert.equal(Array.isArray(snapshot.sources), true);
assert.equal((snapshot.sources ?? []).length >= 2, true);

const defaults = snapshot.defaults?.textureResolution;
assert.equal(typeof defaults?.width, 'number');
assert.equal(typeof defaults?.height, 'number');
assert.equal((defaults?.width ?? 0) > 0, true);
assert.equal((defaults?.height ?? 0) > 0, true);

assert.equal(snapshot.aliases?.geckolib, 'geckolib');

