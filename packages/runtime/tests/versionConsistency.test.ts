import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { PLUGIN_VERSION } from '../src/config';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const pluginPkg = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'apps', 'plugin-desktop', 'package.json'), 'utf8')
) as { version?: unknown };
const ashfoxPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps', 'ashfox', 'package.json'), 'utf8')) as {
  version?: unknown;
};

assert.equal(typeof pluginPkg.version, 'string');
assert.equal(typeof ashfoxPkg.version, 'string');
assert.equal(pluginPkg.version, ashfoxPkg.version);
assert.equal(pluginPkg.version, PLUGIN_VERSION);
