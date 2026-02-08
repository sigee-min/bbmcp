import assert from 'node:assert/strict';

import { BlockbenchExport } from '../../src/adapters/blockbench/BlockbenchExport';
import { noopLog } from './helpers';

type TestGlobals = {
  Blockbench?: unknown;
  Formats?: unknown;
  ModelFormat?: unknown;
};

const getGlobals = (): TestGlobals => globalThis as unknown as TestGlobals;

const withGlobals = (overrides: TestGlobals, run: () => void) => {
  const globals = getGlobals();
  const before = {
    Blockbench: globals.Blockbench,
    Formats: globals.Formats,
    ModelFormat: globals.ModelFormat
  };
  globals.Blockbench = overrides.Blockbench;
  globals.Formats = overrides.Formats;
  globals.ModelFormat = overrides.ModelFormat;
  try {
    run();
  } finally {
    globals.Blockbench = before.Blockbench;
    globals.Formats = before.Formats;
    globals.ModelFormat = before.ModelFormat;
  }
};

{
  const adapter = new BlockbenchExport(noopLog);
  withGlobals({}, () => {
    const error = adapter.exportNative({ formatId: 'geckolib', destPath: 'out.json' });
    assert.equal(error?.code, 'not_implemented');
  });
}

{
  const adapter = new BlockbenchExport(noopLog);
  withGlobals(
    {
      Blockbench: {
        writeFile: () => undefined
      },
      Formats: {}
    },
    () => {
      const error = adapter.exportNative({ formatId: 'geckolib', destPath: 'out.json' });
      assert.equal(error?.code, 'not_implemented');
    }
  );
}

{
  const writes: Array<{ path: string; content: string; savetype: string }> = [];
  const events: string[] = [];
  const adapter = new BlockbenchExport(noopLog);
  withGlobals(
    {
      Blockbench: {
        writeFile: (path: string, payload: { content: string; savetype: string }) => {
          writes.push({ path, content: payload.content, savetype: payload.savetype });
        }
      },
      Formats: {
        geckolib: {
          dispatchEvent: (name: string) => events.push(name),
          compile() {
            this.dispatchEvent('compile');
            return { ok: true };
          }
        }
      }
    },
    () => {
      const error = adapter.exportNative({ formatId: 'geckolib', destPath: 'bound-format.json' });
      assert.equal(error, null);
    }
  );
  assert.equal(events.includes('compile'), true);
  assert.equal(writes.length, 1);
}

{
  const writes: Array<{ path: string; content: string; savetype: string }> = [];
  const events: string[] = [];
  const adapter = new BlockbenchExport(noopLog);
  withGlobals(
    {
      Blockbench: {
        writeFile: (path: string, payload: { content: string; savetype: string }) => {
          writes.push({ path, content: payload.content, savetype: payload.savetype });
        }
      },
      Formats: {
        geckolib: {
          codec: {
            dispatchEvent: (name: string) => events.push(name),
            compile() {
              this.dispatchEvent('codec.compile');
              return { ok: true };
            }
          }
        }
      }
    },
    () => {
      const error = adapter.exportNative({ formatId: 'geckolib', destPath: 'bound-codec.json' });
      assert.equal(error, null);
    }
  );
  assert.equal(events.includes('codec.compile'), true);
  assert.equal(writes.length, 1);
}

{
  const adapter = new BlockbenchExport(noopLog);
  withGlobals(
    {
      Blockbench: {
        writeFile: () => undefined
      },
      Formats: {
        geckolib: { compile: () => undefined }
      }
    },
    () => {
      const error = adapter.exportNative({ formatId: 'geckolib', destPath: 'out.json' });
      assert.equal(error?.code, 'not_implemented');
    }
  );
}

{
  const adapter = new BlockbenchExport(noopLog);
  withGlobals(
    {
      Blockbench: {
        writeFile: () => undefined
      },
      Formats: {
        geckolib: { compile: () => Promise.resolve({ ok: true }) }
      }
    },
    () => {
      const error = adapter.exportNative({ formatId: 'geckolib', destPath: 'out.json' });
      assert.equal(error?.code, 'not_implemented');
    }
  );
}

{
  const writes: Array<{ path: string; content: string; savetype: string }> = [];
  const adapter = new BlockbenchExport(noopLog);
  withGlobals(
    {
      Blockbench: {
        writeFile: (path: string, payload: { content: string; savetype: string }) => {
          writes.push({ path, content: payload.content, savetype: payload.savetype });
        }
      },
      Formats: {
        geckolib: { compile: () => ({ model: 'dragon', version: 1 }) }
      }
    },
    () => {
      const error = adapter.exportNative({ formatId: 'geckolib', destPath: 'out.json' });
      assert.equal(error, null);
    }
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, 'out.json');
  assert.equal(writes[0].savetype, 'text');
  assert.equal(writes[0].content.includes('"model": "dragon"'), true);
}

{
  const writes: Array<{ path: string; content: string; savetype: string }> = [];
  const adapter = new BlockbenchExport(noopLog);
  withGlobals(
    {
      Blockbench: {
        writeFile: (path: string, payload: { content: string; savetype: string }) => {
          writes.push({ path, content: payload.content, savetype: payload.savetype });
        }
      },
      ModelFormat: {
        formats: {
          geckolib: {
            codec: { compile: () => '{"ok":true}' }
          }
        }
      }
    },
    () => {
      const error = adapter.exportNative({ formatId: 'geckolib', destPath: 'codec.json' });
      assert.equal(error, null);
    }
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].content, '{"ok":true}');
}

{
  const adapter = new BlockbenchExport(noopLog);
  withGlobals(
    {
      Blockbench: {
        writeFile: () => undefined
      },
      Formats: {
        geckolib: { compile: () => {
          throw new Error('compile boom');
        } }
      }
    },
    () => {
      const error = adapter.exportNative({ formatId: 'geckolib', destPath: 'out.json' });
      assert.equal(error?.code, 'io_error');
      assert.equal(error?.message.includes('compile boom'), true);
    }
  );
}
