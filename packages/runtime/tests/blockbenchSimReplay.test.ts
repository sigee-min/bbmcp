import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import type { FormatKind } from '../src/types';
import type { ToolPolicies } from '../src/usecases/policies';
import type { TraceStep } from './support/traceRunner';
import { runTrace } from './support/traceRunner';
import { registerAsync } from './helpers';
import { createBlockbenchSimHarness } from './simHarness';

type FixtureExpect =
  | { path: string; equals: unknown }
  | { path: string; notEquals: unknown | { ref: string } }
  | { path: string; defined: true };

type FixtureCapture = { name: string; path: string };

type FixtureStep = {
  op: TraceStep['op'];
  payload?: unknown;
  expect?: FixtureExpect[];
  capture?: FixtureCapture[];
};

type FixtureProject = {
  format: FormatKind;
  name?: string | null;
  formatId?: string | null;
  textureResolution?: { width: number; height: number } | null;
  cubes?: Array<{
    id?: string;
    name: string;
    from: [number, number, number];
    to: [number, number, number];
    bone?: string;
  }>;
  textures?: Array<{ id?: string; name: string; width?: number; height?: number }>;
};

type Fixture = {
  name: string;
  project: FixtureProject;
  policies?: ToolPolicies;
  steps: FixtureStep[];
};

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'blockbench-sim');

const loadFixtures = (): Fixture[] => {
  const files = fs.readdirSync(FIXTURE_DIR).filter((file) => file.endsWith('.json'));
  return files.map((file) => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8')) as Fixture);
};

const getPath = (value: unknown, pathExpr: string): unknown => {
  const tokens = pathExpr.replace(/\[(\d+)\]/g, '.$1').split('.');
  return tokens.reduce((current, token) => {
    if (!current || typeof current !== 'object') return undefined;
    const record = current as Record<string, unknown>;
    return record[token];
  }, value);
};

const resolveExpectValue = (value: unknown, captures: Map<string, unknown>): unknown => {
  if (value && typeof value === 'object' && 'ref' in (value as Record<string, unknown>)) {
    const ref = (value as { ref?: string }).ref;
    return ref ? captures.get(ref) : undefined;
  }
  return value;
};

const assertExpectations = (result: unknown, expects: FixtureExpect[] | undefined, captures: Map<string, unknown>) => {
  if (!expects) return;
  for (const expect of expects) {
    const actual = getPath(result, expect.path);
    if ('defined' in expect && expect.defined) {
      assert.notEqual(actual, undefined);
      continue;
    }
    if ('equals' in expect) {
      assert.deepEqual(actual, resolveExpectValue(expect.equals, captures));
      continue;
    }
    if ('notEquals' in expect) {
      assert.notDeepEqual(actual, resolveExpectValue(expect.notEquals, captures));
    }
  }
};

const createServiceHarness = (fixture: Fixture) => {
  const { dispatcher } = createBlockbenchSimHarness(fixture.project, { policies: fixture.policies });
  return { dispatcher };
};

const fixtures = loadFixtures();
fixtures.forEach((fixture) => {
  registerAsync(
    (async () => {
      const captures = new Map<string, unknown>();
      const harness = createServiceHarness(fixture);
      const runResult = await runTrace({ dispatcher: harness.dispatcher }, fixture.steps);
      for (let idx = 0; idx < fixture.steps.length; idx += 1) {
        const step = fixture.steps[idx];
        const result = runResult.steps[idx]?.response;
        try {
          if (!result) {
            throw new Error(`Trace runner missing result for step ${idx + 1} (${step.op}).`);
          }
          if (result && typeof result === 'object' && 'ok' in (result as { ok?: boolean }) && !(result as { ok?: boolean }).ok) {
            console.error(`Fixture "${fixture.name}" step ${idx + 1} (${step.op}) error:`, (result as { error?: unknown }).error);
          }
          assertExpectations(result, step.expect, captures);
          if (step.capture) {
            step.capture.forEach((capture) => {
              captures.set(capture.name, getPath(result, capture.path));
            });
          }
        } catch (err) {
          console.error(`Fixture "${fixture.name}" failed at step ${idx + 1} (${step.op}).`);
          throw err;
        }
      }
    })()
  );
});



