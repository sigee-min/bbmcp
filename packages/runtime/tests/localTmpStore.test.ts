import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { LocalTmpStore, saveDataUriToTmp } from '../src/adapters/tmp/LocalTmpStore';

const makeTmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ashfox-localtmp-'));

const VALID_DATA_URI = 'data:image/png;base64,AAAA';

{
  const result = saveDataUriToTmp('not-a-data-uri');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'invalid_payload');
  }
}

{
  const tmpRoot = makeTmpRoot();
  const originalNow = Date.now;
  const originalRandom = Math.random;
  Date.now = () => 1700000000000;
  Math.random = () => 0.123456789;
  try {
    const result = saveDataUriToTmp(VALID_DATA_URI, {
      cwd: tmpRoot,
      nameHint: '  pot name  ',
      prefix: 'prefix'
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.mimeType, 'image/png');
      assert.match(result.data.path, /pot_name_1700000000000_[a-z0-9]{6}\.png$/);
      assert.equal(result.data.byteLength, Buffer.from('AAAA', 'base64').byteLength);
      assert.equal(fs.existsSync(result.data.path), true);
      assert.equal(fs.statSync(result.data.path).size, result.data.byteLength);
    }
  } finally {
    Date.now = originalNow;
    Math.random = originalRandom;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

{
  const tmpRoot = makeTmpRoot();
  const fileRoot = path.join(tmpRoot, 'root-file');
  fs.writeFileSync(fileRoot, 'x');
  try {
    const result = saveDataUriToTmp(VALID_DATA_URI, { cwd: fileRoot });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'io_error');
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

{
  const tmpRoot = makeTmpRoot();
  const fsMutable = fs as unknown as { writeFileSync: typeof fs.writeFileSync };
  const originalWrite = fsMutable.writeFileSync;
  fsMutable.writeFileSync = (() => {
    throw new Error('write denied');
  }) as typeof fs.writeFileSync;
  try {
    const result = saveDataUriToTmp(VALID_DATA_URI, { cwd: tmpRoot });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'io_error');
    }
  } finally {
    fsMutable.writeFileSync = originalWrite;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

{
  const tmpRoot = makeTmpRoot();
  const mutableBuffer = Buffer as unknown as { from: typeof Buffer.from };
  const originalBufferFrom = mutableBuffer.from;
  mutableBuffer.from = ((value: string, encoding?: BufferEncoding) => {
    if (encoding === 'base64') throw new Error('decode fail');
    return originalBufferFrom(value, encoding);
  }) as typeof Buffer.from;
  try {
    const result = saveDataUriToTmp(VALID_DATA_URI, { cwd: tmpRoot });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'invalid_payload');
    }
  } finally {
    mutableBuffer.from = originalBufferFrom;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

{
  const tmpRoot = makeTmpRoot();
  try {
    const store = new LocalTmpStore();
    const result = store.saveDataUri(VALID_DATA_URI, { cwd: tmpRoot, prefix: 'unit' });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(fs.existsSync(result.data.path), true);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}


