import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BlockbenchTraceLogWriter } from '../../src/adapters/blockbench/BlockbenchTraceLogWriter';

const withGlobals = (overrides: Record<string, unknown>, fn: () => void) => {
  const globals = globalThis as Record<string, unknown>;
  const previous = Object.entries(overrides).map(([key, value]) => ({
    key,
    exists: Object.prototype.hasOwnProperty.call(globals, key),
    value: globals[key],
    next: value
  }));
  for (const entry of previous) {
    if (entry.next === undefined) delete globals[entry.key];
    else globals[entry.key] = entry.next;
  }
  try {
    fn();
  } finally {
    for (const entry of previous) {
      if (entry.exists) globals[entry.key] = entry.value;
      else delete globals[entry.key];
    }
  }
};

// Directory destPath should resolve to `<destPath>/<fileName>`.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ashfox-trace-'));
  let writtenPath = '';
  const writer = new BlockbenchTraceLogWriter({
    mode: 'writeFile',
    destPath: dir,
    fileName: 'trace.ndjson'
  });
  try {
    withGlobals(
      {
        Blockbench: {
          writeFile: (targetPath: string) => {
            writtenPath = targetPath;
          }
        },
        Project: null
      },
      () => {
        const err = writer.write('trace-data');
        assert.equal(err, null);
      }
    );
    assert.equal(path.normalize(writtenPath), path.normalize(path.join(dir, 'trace.ndjson')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Missing Blockbench API should return not_implemented.
{
  const writer = new BlockbenchTraceLogWriter({ mode: 'auto' });
  withGlobals(
    {
      Blockbench: undefined,
      Project: null
    },
    () => {
      const err = writer.write('trace-data');
      assert.notEqual(err, null);
      assert.equal(err?.code, 'not_implemented');
      assert.equal(err?.details?.reason, 'blockbench_missing');
    }
  );
}

// writeFile mode without resolved path should fail with explicit writefile_unavailable reason.
{
  const writer = new BlockbenchTraceLogWriter({ mode: 'writeFile' });
  withGlobals(
    {
      Blockbench: {},
      Project: null
    },
    () => {
      const err = writer.write('trace-data');
      assert.notEqual(err, null);
      assert.equal(err?.code, 'not_implemented');
      assert.equal(err?.details?.reason, 'writefile_unavailable');
      assert.equal(err?.details?.missingPath, true);
    }
  );
}

// auto mode should fall back to export when writeFile is unavailable.
{
  const exported: Array<{ content: string; name: string }> = [];
  const writer = new BlockbenchTraceLogWriter({ mode: 'auto', fileName: 'trace.ndjson' });
  withGlobals(
    {
      Blockbench: {
        exportFile: (payload: { content: string; name: string }) => {
          exported.push(payload);
        }
      },
      Project: null
    },
    () => {
      const err = writer.write('trace-data');
      assert.equal(err, null);
    }
  );
  assert.equal(exported.length, 1);
  assert.equal(exported[0].name, 'trace.ndjson');
}

// auto mode should preserve write errors when export fallback is unavailable.
{
  const writer = new BlockbenchTraceLogWriter({
    mode: 'auto',
    destPath: path.join(os.tmpdir(), 'ashfox-trace-auto-error.ndjson')
  });
  withGlobals(
    {
      Blockbench: {
        writeFile: () => {
          throw new Error('write boom');
        }
      },
      Project: null
    },
    () => {
      const err = writer.write('trace-data');
      assert.notEqual(err, null);
      assert.equal(err?.code, 'io_error');
      assert.equal(err?.details?.reason, 'trace_log_write_failed');
    }
  );
}

// export mode should fail cleanly when exportFile is unavailable.
{
  const writer = new BlockbenchTraceLogWriter({ mode: 'export' });
  withGlobals(
    {
      Blockbench: {},
      Project: null
    },
    () => {
      const err = writer.write('trace-data');
      assert.notEqual(err, null);
      assert.equal(err?.code, 'not_implemented');
      assert.equal(err?.details?.reason, 'export_unavailable');
    }
  );
}

// export mode should map export exceptions to io_error.
{
  const writer = new BlockbenchTraceLogWriter({ mode: 'export', fileName: 'trace.ndjson' });
  withGlobals(
    {
      Blockbench: {
        exportFile: () => {
          throw new Error('export boom');
        }
      },
      Project: null
    },
    () => {
      const err = writer.write('trace-data');
      assert.notEqual(err, null);
      assert.equal(err?.code, 'io_error');
      assert.equal(err?.details?.reason, 'trace_log_export_failed');
    }
  );
}

// When destPath is omitted, project save_path directory should be used.
{
  let writtenPath = '';
  const writer = new BlockbenchTraceLogWriter({
    mode: 'writeFile',
    fileName: 'trace.ndjson'
  });
  withGlobals(
    {
      Blockbench: {
        writeFile: (targetPath: string) => {
          writtenPath = targetPath;
        }
      },
      Project: { save_path: path.join('C:', 'tmp', 'project.bbmodel') }
    },
    () => {
      const err = writer.write('trace-data');
      assert.equal(err, null);
    }
  );
  assert.equal(path.normalize(writtenPath), path.normalize(path.join('C:', 'tmp', 'trace.ndjson')));
}

// File destPath should be used as-is.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ashfox-trace-'));
  const targetFile = path.join(dir, 'custom-output.log');
  let writtenPath = '';
  const writer = new BlockbenchTraceLogWriter({
    mode: 'writeFile',
    destPath: targetFile,
    fileName: 'trace.ndjson'
  });
  try {
    withGlobals(
      {
        Blockbench: {
          writeFile: (targetPath: string) => {
            writtenPath = targetPath;
          }
        },
        Project: null
      },
      () => {
        const err = writer.write('trace-data');
        assert.equal(err, null);
      }
    );
    assert.equal(path.normalize(writtenPath), path.normalize(targetFile));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// EISDIR from writeFile should retry once with appended file name.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ashfox-trace-'));
  const attempted: string[] = [];
  const basePath = path.join(dir, 'logs');
  const writer = new BlockbenchTraceLogWriter({
    mode: 'writeFile',
    destPath: basePath,
    fileName: 'trace.ndjson'
  });
  try {
    withGlobals(
      {
        Blockbench: {
          writeFile: (targetPath: string) => {
            attempted.push(targetPath);
            if (attempted.length === 1) {
              const err = new Error(`EISDIR: illegal operation on a directory, open '${targetPath}'`) as Error & {
                code?: string;
              };
              err.code = 'EISDIR';
              throw err;
            }
          }
        },
        Project: null
      },
      () => {
        const err = writer.write('trace-data');
        assert.equal(err, null);
      }
    );
    assert.equal(attempted.length, 2);
    assert.equal(path.normalize(attempted[0]), path.normalize(basePath));
    assert.equal(path.normalize(attempted[1]), path.normalize(path.join(basePath, 'trace.ndjson')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

