import assert from 'node:assert/strict';

import { ConsoleLogger } from '../src/logging';
import { ProjectSession } from '../src/session';
import { registerCodecs } from '../src/plugin/runtimeCodecs';

type TestGlobals = {
  Blockbench?: unknown;
  Codec?: unknown;
  Formats?: unknown;
  ModelFormat?: unknown;
};

const getGlobals = (): TestGlobals => globalThis as TestGlobals;

const withGlobals = (overrides: TestGlobals, run: () => void) => {
  const globals = getGlobals();
  const before = {
    Blockbench: globals.Blockbench,
    Codec: globals.Codec,
    Formats: globals.Formats,
    ModelFormat: globals.ModelFormat
  };
  globals.Blockbench = overrides.Blockbench;
  globals.Codec = overrides.Codec;
  globals.Formats = overrides.Formats;
  globals.ModelFormat = overrides.ModelFormat;
  try {
    run();
  } finally {
    globals.Blockbench = before.Blockbench;
    globals.Codec = before.Codec;
    globals.Formats = before.Formats;
    globals.ModelFormat = before.ModelFormat;
  }
};

{
  const session = new ProjectSession();
  const created = session.create('dragon', 'geckolib_model');
  assert.equal(created.ok, true);
  const events: string[] = [];
  const registered: Array<Record<string, unknown>> = [];
  const quickMessages: string[] = [];

  class CodecCtor {
    constructor(config: Record<string, unknown>) {
      registered.push(config);
    }
  }

  withGlobals(
    {
      Blockbench: {
        showQuickMessage: (message: string) => quickMessages.push(message),
        exportFile: () => undefined
      },
      Codec: CodecCtor,
      Formats: {
        geckolib: {
          dispatchEvent: (name: string) => events.push(name),
          compile() {
            (this as { dispatchEvent: (name: string) => void }).dispatchEvent('compile');
            return { ok: true };
          }
        }
      }
    },
    () => {
      registerCodecs({
        session,
        formats: {
          listFormats: () => [{ id: 'entity_rig', name: 'GeckoLib' }],
          getActiveFormatId: () => null
        } as never,
        formatOverrides: {},
        exportPolicy: 'strict',
        logger: new ConsoleLogger('unit', () => 'error')
      });
      assert.equal(registered.length, 1);
      const geckoCodec = registered.find((entry) => String(entry.name).includes('_entity_rig'));
      assert.ok(geckoCodec);
      const compiled = geckoCodec!.compile as () => string;
      const out = compiled();
      assert.equal(typeof out, 'string');
      assert.equal(out.includes('"ok":true') || out.includes('"ok": true'), true);
      assert.equal(events.includes('compile'), true);
      assert.equal(quickMessages.length, 0);
    }
  );
}

{
  const session = new ProjectSession();
  const created = session.create('dragon', 'geckolib_model');
  assert.equal(created.ok, true);
  const registered: Array<Record<string, unknown>> = [];

  class CodecCtor {
    constructor(config: Record<string, unknown>) {
      registered.push(config);
    }
  }

  withGlobals(
    {
      Blockbench: {
        showQuickMessage: () => undefined,
        exportFile: () => undefined
      },
      Codec: CodecCtor,
      Formats: {}
    },
    () => {
      registerCodecs({
        session,
        formats: {
          listFormats: () => [{ id: 'entity_rig', name: 'GeckoLib' }],
          getActiveFormatId: () => null
        } as never,
        formatOverrides: {},
        exportPolicy: 'best_effort',
        logger: new ConsoleLogger('unit', () => 'error')
      });
      assert.equal(registered.length, 1);
      const compiled = registered[0].compile as () => string;
      const out = compiled();
      assert.equal(typeof out, 'string');
      assert.equal(out.includes('minecraft:geometry'), true);
    }
  );
}
