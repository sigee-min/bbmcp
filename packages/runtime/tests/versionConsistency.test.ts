import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { PLUGIN_VERSION } from '../src/config';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version?: unknown };

assert.equal(typeof pkg.version, 'string');
assert.equal(pkg.version, PLUGIN_VERSION);

