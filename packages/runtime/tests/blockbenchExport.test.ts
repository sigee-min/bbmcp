import assert from 'node:assert/strict';

import { BlockbenchExport } from '../src/adapters/blockbench/BlockbenchExport';
import { noopLog, registerAsync } from './helpers';

type TestGlobals = {
  Blockbench?: unknown;
  Formats?: unknown;
  ModelFormat?: unknown;
  Codecs?: unknown;
};

const getGlobals = (): TestGlobals => globalThis as TestGlobals;

const withGlobals = (overrides: TestGlobals, run: () => void) => {
  const globals = getGlobals();
  const before = {
    Blockbench: globals.Blockbench,
    Formats: globals.Formats,
    ModelFormat: globals.ModelFormat,
    Codecs: (globals as TestGlobals).Codecs
  };
  globals.Blockbench = overrides.Blockbench;
  globals.Formats = overrides.Formats;
  globals.ModelFormat = overrides.ModelFormat;
  (globals as TestGlobals).Codecs = overrides.Codecs;
  try {
    run();
  } finally {
    globals.Blockbench = before.Blockbench;
    globals.Formats = before.Formats;
    globals.ModelFormat = before.ModelFormat;
    (globals as TestGlobals).Codecs = before.Codecs;
  }
};

const withGlobalsAsync = async (overrides: TestGlobals, run: () => Promise<void>) => {
  const globals = getGlobals();
  const before = {
    Blockbench: globals.Blockbench,
    Formats: globals.Formats,
    ModelFormat: globals.ModelFormat,
    Codecs: (globals as TestGlobals).Codecs
  };
  globals.Blockbench = overrides.Blockbench;
  globals.Formats = overrides.Formats;
  globals.ModelFormat = overrides.ModelFormat;
  (globals as TestGlobals).Codecs = overrides.Codecs;
  try {
    await run();
  } finally {
    globals.Blockbench = before.Blockbench;
    globals.Formats = before.Formats;
    globals.ModelFormat = before.ModelFormat;
    (globals as TestGlobals).Codecs = before.Codecs;
  }
};

{
    const adapter = new BlockbenchExport(noopLog);
  withGlobals({}, () => {
    const error = adapter.exportNative({ formatId: 'entity_rig', destPath: 'out.json' });
    assert.equal(error?.code, 'invalid_state');
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
      const error = adapter.exportNative({ formatId: 'entity_rig', destPath: 'out.json' });
      assert.equal(error?.code, 'invalid_state');
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
      const error = adapter.exportNative({ formatId: 'entity_rig', destPath: 'bound-format.json' });
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
      const error = adapter.exportNative({ formatId: 'entity_rig', destPath: 'bound-codec.json' });
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
      const error = adapter.exportNative({ formatId: 'entity_rig', destPath: 'out.json' });
      assert.equal(error?.code, 'invalid_state');
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
      const error = adapter.exportNative({ formatId: 'entity_rig', destPath: 'out.json' });
      assert.equal(error?.code, 'invalid_state');
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
      const error = adapter.exportNative({ formatId: 'entity_rig', destPath: 'out.json' });
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
      Formats: {
        geckolib: { compile: () => ({ model: 'dragon' }) }
      }
    },
    () => {
      const error = adapter.exportNative({ formatId: 'entity_rig', destPath: 'outdir/' });
      assert.equal(error, null);
    }
  );
  assert.equal(writes.length, 1);
  assert.match(writes[0].path, /outdir[\\/]model\.json$/);
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
      const error = adapter.exportNative({ formatId: 'entity_rig', destPath: 'codec.json' });
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
      const error = adapter.exportNative({ formatId: 'entity_rig', destPath: 'out.json' });
      assert.equal(error?.code, 'io_error');
      assert.equal(error?.message.includes('compile boom'), true);
    }
  );
}

registerAsync(
  (async () => {
    {
      const adapter = new BlockbenchExport(noopLog);
      await withGlobalsAsync(
        {
          Blockbench: {
            writeFile: () => undefined
          },
          Codecs: {}
        },
        async () => {
          const error = await adapter.exportGltf({ destPath: 'out.glb' });
          assert.equal(error?.code, 'invalid_state');
        }
      );
    }

    {
      const writes: Array<{ content: unknown; path: string }> = [];
      const adapter = new BlockbenchExport(noopLog);
      await withGlobalsAsync(
        {
          Blockbench: {
            writeFile: () => undefined
          },
          Codecs: {
            gltf: {
              compile: () => ({ scene: true }),
              write: (content: unknown, path: string) => {
                writes.push({ content, path });
              }
            }
          }
        },
        async () => {
          const error = await adapter.exportGltf({ destPath: 'codec.glb' });
          assert.equal(error, null);
        }
      );
      assert.equal(writes.length, 1);
      assert.equal(writes[0].path, 'codec.glb');
    }

    {
      const writes: Array<{ path: string; content: string; savetype: string }> = [];
      const adapter = new BlockbenchExport(noopLog);
      await withGlobalsAsync(
        {
          Blockbench: {
            writeFile: (path: string, payload: { content: string; savetype: string }) => {
              writes.push({ path, content: payload.content, savetype: payload.savetype });
            }
          },
          Codecs: {
            gltf: {
              compile: () => ({ asset: { version: '2.0' } })
            }
          }
        },
        async () => {
          const error = await adapter.exportGltf({ destPath: 'fallback.gltf' });
          assert.equal(error, null);
        }
      );
      assert.equal(writes.length, 1);
      assert.equal(writes[0].path, 'fallback.gltf');
      assert.equal(writes[0].content.includes('"version": "2.0"'), true);
    }

    {
      const writes: Array<{ path: string; content: string; savetype: string }> = [];
      const adapter = new BlockbenchExport(noopLog);
      await withGlobalsAsync(
        {
          Blockbench: {
            writeFile: (path: string, payload: { content: string; savetype: string }) => {
              writes.push({ path, content: payload.content, savetype: payload.savetype });
            }
          },
          Codecs: {
            gltf: {
              compile: () => Promise.resolve({ scene: true })
            }
          }
        },
        async () => {
          const error = await adapter.exportGltf({ destPath: 'async.gltf' });
          assert.equal(error, null);
        }
      );
      assert.equal(writes.length, 1);
    }

    {
      const writes: Array<{ content: unknown; path: string }> = [];
      const adapter = new BlockbenchExport(noopLog);
      await withGlobalsAsync(
        {
          Blockbench: {
            writeFile: () => undefined
          },
          Codecs: {
            gltf: {
              compile: () => ({ scene: true }),
              write: async (content: unknown, path: string) => {
                writes.push({ content, path });
              }
            }
          }
        },
        async () => {
          const error = await adapter.exportGltf({ destPath: 'async-write.glb' });
          assert.equal(error, null);
        }
      );
      assert.equal(writes.length, 1);
      assert.equal(writes[0].path, 'async-write.glb');
    }

    {
      const writes: Array<{ content: unknown; path: string }> = [];
      const adapter = new BlockbenchExport(noopLog);
      await withGlobalsAsync(
        {
          Blockbench: {
            writeFile: () => undefined
          },
          Codecs: {
            obj: {
              id: 'obj',
              name: 'Wavefront OBJ',
              extension: 'obj',
              compile: () => ({ mesh: true }),
              write: (content: unknown, path: string) => {
                writes.push({ content, path });
              }
            }
          }
        },
        async () => {
          const error = await adapter.exportCodec?.({ codecId: 'obj', destPath: 'asset.obj' });
          assert.equal(error, null);
        }
      );
      assert.equal(writes.length, 1);
      assert.equal(writes[0].path, 'asset.obj');
    }

    {
      const adapter = new BlockbenchExport(noopLog);
      await withGlobalsAsync(
        {
          Blockbench: {
            writeFile: () => undefined
          },
          Codecs: {}
        },
        async () => {
          const error = await adapter.exportCodec?.({ codecId: 'fbx', destPath: 'asset.fbx' });
          assert.equal(error?.code, 'invalid_state');
        }
      );
    }

    {
      const adapter = new BlockbenchExport(noopLog);
      await withGlobalsAsync(
        {
          Codecs: {
            obj: {
              id: 'obj',
              name: 'Wavefront OBJ',
              extension: 'obj'
            },
            fbx: {
              id: 'fbx',
              name: 'FBX',
              extension: 'fbx'
            }
          }
        },
        async () => {
          const targets = adapter.listNativeCodecs?.() ?? [];
          assert.equal(targets.length, 2);
          assert.equal(targets.some((target) => target.id === 'obj' && target.extensions.includes('obj')), true);
          assert.equal(targets.some((target) => target.id === 'fbx' && target.extensions.includes('fbx')), true);
        }
      );
    }
  })()
);
