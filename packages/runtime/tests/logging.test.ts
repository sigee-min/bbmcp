import assert from 'node:assert/strict';

import { ConsoleLogger, errorMessage, safeFormatMeta, safeStringify } from '../src/logging';

{
  const token = 'A'.repeat(128);
  const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
  const manyKeys = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`k${i}`, i]));
  const manyItems = Array.from({ length: 45 }, (_, i) => i);
  const text = safeStringify({
    authorization: 'Bearer secret',
    api_key: 'key',
    nested: { password: 'pw', token: 'tok' },
    jwt: 'aaa.bbb.ccc',
    data: token,
    dataUri: 'data:image/png;base64,AAAA',
    deep,
    manyKeys,
    manyItems
  });
  assert.match(text, /\[redacted:authorization\]/);
  assert.match(text, /\[redacted:api_key\]/);
  assert.match(text, /\[redacted:password\]/);
  assert.match(text, /\[redacted:token\]/);
  assert.match(text, /\[redacted:jwt\]/);
  assert.match(text, /\[base64:128 chars\]/);
  assert.match(text, /data:image\/png;base64,\[4 chars\]/);
  assert.match(text, /\[MaxDepth\]/);
  assert.match(text, /_truncatedKeys":5/);
  assert.match(text, /\[\+5 more\]/);
}

{
  const circular: { self?: unknown } = {};
  circular.self = circular;
  const value = safeStringify(circular);
  assert.match(value, /\[Circular\]/);
}

{
  const bad: Record<string, unknown> = {};
  Object.defineProperty(bad, 'boom', {
    enumerable: true,
    get: () => {
      throw new Error('explode');
    }
  });
  const value = safeStringify(bad);
  assert.match(value, /^\[unserializable meta: explode\]/);
}

{
  assert.equal(safeFormatMeta(undefined), null);
  assert.equal(safeFormatMeta({ ok: true })?.includes('"ok":true'), true);
}

{
  assert.equal(errorMessage(new Error('failed')), 'failed');
  assert.equal(errorMessage('raw', 'fallback'), 'fallback');
  assert.equal(errorMessage('raw'), 'raw');
}

{
  const original = console.log;
  const lines: string[] = [];
  console.log = ((message?: unknown) => {
    lines.push(String(message ?? ''));
  }) as typeof console.log;
  try {
    const logger = new ConsoleLogger('unit', 'warn');
    logger.debug('debug');
    logger.info('info');
    logger.warn('warn', { token: 'secret' });
    logger.error('error');
  } finally {
    console.log = original;
  }
  assert.equal(lines.length, 2);
  assert.match(lines[0] ?? '', /\[unit\] \[warn\] warn /);
  assert.match(lines[0] ?? '', /\[redacted:token\]/);
  assert.match(lines[1] ?? '', /\[unit\] \[error\] error/);
}

{
  const original = console.log;
  const lines: string[] = [];
  let level: 'debug' | 'info' | 'warn' | 'error' = 'error';
  console.log = ((message?: unknown) => {
    lines.push(String(message ?? ''));
  }) as typeof console.log;
  try {
    const logger = new ConsoleLogger('dynamic', () => level);
    logger.warn('skip');
    level = 'debug';
    logger.debug('hit');
  } finally {
    console.log = original;
  }
  assert.equal(lines.length, 1);
  assert.match(lines[0] ?? '', /\[dynamic\] \[debug\] hit/);
}

