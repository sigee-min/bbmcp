import assert from 'node:assert/strict';

import type { Logger } from '../src/logging';
import { BlockbenchProjectAdapter } from '../src/adapters/blockbench/BlockbenchProjectAdapter';
import {
  ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE,
  ADAPTER_PROJECT_CLOSE_UNAVAILABLE,
  ADAPTER_PROJECT_CLOSE_UNSAVED_CHANGES,
  ADAPTER_PROJECT_CREATE_UNAVAILABLE,
  ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED,
  ADAPTER_PROJECT_UNSAVED_CHANGES
} from '../src/shared/messages';
import { withGlobals as withGlobalOverrides } from './support/withGlobals';

type TestGlobals = {
  Blockbench?: unknown;
  Project?: unknown;
  ModelFormat?: unknown;
  Formats?: Record<string, unknown>;
  Dialog?: unknown;
};

const logger: Logger = {
  log: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const withGlobals = (overrides: TestGlobals, run: () => void) =>
  withGlobalOverrides(
    {
      Blockbench: overrides.Blockbench,
      Project: overrides.Project,
      ModelFormat: overrides.ModelFormat,
      Formats: overrides.Formats,
      Dialog: overrides.Dialog
    },
    run
  );

{
  withGlobals(
    {
      Blockbench: { project: { saved: true } },
      ModelFormat: {},
      Formats: {}
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.createProject('demo', 'fmt');
      assert.deepEqual(err, { code: 'invalid_state', message: ADAPTER_PROJECT_CREATE_UNAVAILABLE });
    }
  );
}

{
  let newProjectCalls = 0;
  const project = { saved: false, name: '' };
  withGlobals(
    {
      Blockbench: {
        project,
        newProject: () => {
          newProjectCalls += 1;
        }
      },
      ModelFormat: {},
      Formats: {}
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.createProject('demo', 'fmt', { confirmDiscard: false });
      assert.deepEqual(err, { code: 'invalid_state', message: ADAPTER_PROJECT_UNSAVED_CHANGES });
      assert.equal(newProjectCalls, 0);
    }
  );
}

{
  let formatNewCalls = 0;
  const project = { saved: true, name: '' };
  withGlobals(
    {
      Blockbench: { project },
      ModelFormat: {},
      Formats: {
        geckolib_model: {
          new: () => {
            formatNewCalls += 1;
          }
        }
      }
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.createProject('dragon', 'geckolib_model');
      assert.equal(err, null);
      assert.equal(formatNewCalls, 1);
      assert.equal(project.name, 'dragon');
    }
  );
}

{
  let newProjectFormat = '';
  let projectName = '';
  const project = { saved: true, name: '' };
  withGlobals(
    {
      Blockbench: {
        project,
        newProject: (formatId: string) => {
          newProjectFormat = formatId;
        },
        setProjectName: (name: string) => {
          projectName = name;
        }
      },
      ModelFormat: {},
      Formats: {}
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.createProject('wyvern', 'entity_alt');
      assert.equal(err, null);
      assert.equal(newProjectFormat, 'entity_alt');
      assert.equal(projectName, 'wyvern');
    }
  );
}

{
  let modelFormatCalls = 0;
  const project = { saved: true, name: '' };
  withGlobals(
    {
      Blockbench: { project },
      ModelFormat: {
        new: () => {
          modelFormatCalls += 1;
        }
      },
      Formats: {}
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.createProject('hydra', 'fmt');
      assert.equal(err, null);
      assert.equal(modelFormatCalls, 1);
    }
  );
}

{
  const project = { saved: true, name: '' };
  withGlobals(
    {
      Blockbench: {
        project,
        newProject: () => undefined
      },
      ModelFormat: {},
      Formats: {},
      Dialog: {
        open: {
          getFormResult: () => ({ name: '', format: '' }),
          setFormValues: () => undefined,
          confirm: () => undefined
        }
      }
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.createProject('dragon', 'geckolib_model');
      assert.ok(err);
      assert.equal(err?.code, 'invalid_state');
      assert.equal(err?.message, ADAPTER_PROJECT_DIALOG_INPUT_REQUIRED);
    }
  );
}

{
  withGlobals(
    {
      Blockbench: { project: { saved: true } },
      ModelFormat: {},
      Formats: {
        geckolib_model: {
          new: () => {
            throw new Error('create fail');
          }
        }
      }
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.createProject('dragon', 'geckolib_model');
      assert.ok(err);
      assert.equal(err?.code, 'unknown');
      assert.equal(err?.details?.context, 'project_create');
      assert.equal(err?.details?.reason, 'adapter_exception');
    }
  );
}

{
  const project = { saved: false, close: () => undefined };
  withGlobals(
    {
      Blockbench: {
        project
      },
      Project: project
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.closeProject();
      assert.deepEqual(err, { code: 'invalid_state', message: ADAPTER_PROJECT_CLOSE_UNSAVED_CHANGES });
    }
  );
}

{
  const project = { saved: true };
  withGlobals(
    {
      Blockbench: {
        project
      },
      Project: project
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.closeProject();
      assert.deepEqual(err, { code: 'invalid_state', message: ADAPTER_PROJECT_CLOSE_UNAVAILABLE });
    }
  );
}

{
  const project = {
    saved: true,
    close: () => {
      throw new Error('close fail');
    }
  };
  withGlobals(
    {
      Blockbench: {
        project
      },
      Project: project
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.closeProject();
      assert.ok(err);
      assert.equal(err?.code, 'unknown');
      assert.equal(err?.details?.context, 'project_close');
      assert.equal(err?.details?.reason, 'adapter_exception');
    }
  );
}

{
  withGlobals(
    {
      Blockbench: {}
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.writeFile('out.json', '{}');
      assert.deepEqual(err, { code: 'invalid_state', message: ADAPTER_BLOCKBENCH_WRITEFILE_UNAVAILABLE });
    }
  );
}

{
  const writes: Array<{ path: string; content: string; savetype: string }> = [];
  withGlobals(
    {
      Blockbench: {
        writeFile: (path: string, payload: { content: string; savetype: string }) => {
          writes.push({ path, content: payload.content, savetype: payload.savetype });
        }
      }
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.writeFile('out.json', '{"ok":true}');
      assert.equal(err, null);
      assert.deepEqual(writes, [{ path: 'out.json', content: '{"ok":true}', savetype: 'text' }]);
    }
  );
}

{
  withGlobals(
    {
      Blockbench: {
        writeFile: () => {
          throw new Error('write fail');
        }
      }
    },
    () => {
      const adapter = new BlockbenchProjectAdapter(logger);
      const err = adapter.writeFile('out.json', '{}');
      assert.ok(err);
      assert.equal(err?.code, 'io_error');
      assert.equal(err?.message, 'write fail');
    }
  );
}
