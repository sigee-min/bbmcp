import assert from 'node:assert/strict';

import { respondErrorSimple, respondOk } from '../src/dispatcher/responseHelpers';
import { recordTrace } from '../src/dispatcher/trace';
import { markSchemaValidated } from '../../contracts/src/mcpSchemas/validationFlag';

{
  const response = respondOk({ ok: true });
  assert.deepEqual(response, { ok: true, data: { ok: true } });
}

{
  const response = respondErrorSimple('invalid_payload', 'bad payload', { context: 'unit' });
  assert.equal(response.ok, false);
  if (!response.ok) {
    assert.equal(response.error.code, 'invalid_payload');
    assert.equal(response.error.message, 'bad payload.');
    assert.deepEqual(response.error.details, { context: 'unit', reason: 'invalid_payload' });
  }
}

{
  const events: Array<{ tool: string }> = [];
  const traceRecorder = {
    record: (tool: string) => {
      events.push({ tool });
    }
  };
  const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  const logger = {
    log: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: (message: string, meta?: Record<string, unknown>) => {
      warnings.push({ message, meta });
    },
    error: () => undefined
  };
  recordTrace(traceRecorder as never, logger as never, 'get_project_state', {}, { ok: true, data: {} });
  assert.deepEqual(events, [{ tool: 'get_project_state' }]);
  assert.equal(warnings.length, 0);
}

{
  const warnings: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  const logger = {
    log: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: (message: string, meta?: Record<string, unknown>) => {
      warnings.push({ message, meta });
    },
    error: () => undefined
  };
  const traceRecorder = {
    record: () => {
      throw new Error('trace failed');
    }
  };
  recordTrace(traceRecorder as never, logger as never, 'get_project_state', {}, { ok: true, data: {} });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.message, 'trace log record failed');
  assert.equal(warnings[0]?.meta?.message, 'trace failed');
}

{
  recordTrace(undefined, {
    log: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  }, 'get_project_state', {}, { ok: true, data: {} });
}

{
  markSchemaValidated(null);
  markSchemaValidated(1);
  markSchemaValidated('x');
  markSchemaValidated({});
}
