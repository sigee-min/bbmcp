import assert from 'node:assert/strict';

import { loadNativeModule } from '../src/shared/nativeModules';

type NativeLoader = (name: string, options?: { message?: string; detail?: string; optional?: boolean }) => unknown;

{
  const globals = globalThis as { requireNativeModule?: NativeLoader };
  const original = globals.requireNativeModule;
  let capturedName = '';
  let capturedOptional: boolean | undefined;
  globals.requireNativeModule = (name, options) => {
    capturedName = name;
    capturedOptional = options?.optional;
    return { source: 'bridge', name };
  };
  try {
    const mod = loadNativeModule<{ source: string; name: string }>('fs', { optional: true });
    assert.deepEqual(mod, { source: 'bridge', name: 'fs' });
    assert.equal(capturedName, 'fs');
    assert.equal(capturedOptional, true);
  } finally {
    globals.requireNativeModule = original;
  }
}

{
  const globals = globalThis as { requireNativeModule?: NativeLoader };
  const original = globals.requireNativeModule;
  globals.requireNativeModule = () => {
    throw new Error('bridge fail');
  };
  try {
    const mod = loadNativeModule<typeof import('node:path')>('path');
    assert.equal(typeof mod?.resolve, 'function');
  } finally {
    globals.requireNativeModule = original;
  }
}

{
  const globals = globalThis as { requireNativeModule?: NativeLoader };
  const original = globals.requireNativeModule;
  globals.requireNativeModule = () => null;
  try {
    const mod = loadNativeModule<Record<string, unknown>>('__ashfox_missing_native_module__');
    assert.equal(mod, null);
  } finally {
    globals.requireNativeModule = original;
  }
}


