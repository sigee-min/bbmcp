import assert from 'node:assert/strict';

import type { FormatKind } from '../src/types';
import { BlockbenchSimEngine } from './support/BlockbenchSimEngine';
import { ProjectSession } from '../src/session';
import { ToolService } from '../src/usecases/ToolService';
import type { ToolPolicies } from '../src/usecases/policies';
import { ToolDispatcherImpl } from '../src/dispatcher';
import { DEFAULT_LIMITS, noopLog } from './helpers';
import {
  createExportPortStub,
  createFormatPortStub,
  createHostPortStub,
  createResourceStoreStub,
  createTextureRendererStub,
  createTmpStoreStub
} from './fakes';

export type SimHarnessProject = {
  format: FormatKind;
  name?: string | null;
  formatId?: string | null;
  textureResolution?: { width: number; height: number } | null;
  uvPixelsPerBlock?: number;
  cubes?: Array<{
    id?: string;
    name: string;
    from: [number, number, number];
    to: [number, number, number];
    bone?: string;
  }>;
  textures?: Array<{ id?: string; name: string; width?: number; height?: number }>;
};

export const createBlockbenchSimHarness = (
  project: SimHarnessProject,
  options?: { policies?: ToolPolicies }
) => {
  const engine = new BlockbenchSimEngine({
    project: {
      format: project.format,
      name: project.name ?? null,
      formatId: project.formatId ?? null,
      textureResolution: project.textureResolution ?? null,
      ...(project.uvPixelsPerBlock !== undefined ? { uvPixelsPerBlock: project.uvPixelsPerBlock } : {})
    }
  });

  const session = new ProjectSession();
  const capabilities = {
    pluginVersion: 'test',
    blockbenchVersion: 'test',
    formats: [{ format: project.format, animations: true, enabled: true }],
    limits: DEFAULT_LIMITS
  };

  const formatId = engine.formatId ?? project.formatId ?? project.format;
  const formatName = engine.formatName ?? formatId;
  const formatCaps = engine.formatCaps;

  const formats = createFormatPortStub(formatId ?? 'unknown', formatName ?? 'format', {
    singleTexture: formatCaps?.singleTexture,
    perTextureUvSize: formatCaps?.perTextureUvSize
  });

  const service = new ToolService({
    session,
    capabilities,
    editor: engine.editor,
    formats,
    snapshot: engine.snapshotPort,
    exporter: createExportPortStub('not_implemented'),
    host: createHostPortStub(),
    textureRenderer: createTextureRendererStub(),
    tmpStore: createTmpStoreStub(),
    resources: createResourceStoreStub(),
    policies: { autoAttachActiveProject: true, ...(options?.policies ?? {}) }
  });

  const dispatcher = new ToolDispatcherImpl(session, capabilities, service, {
    includeStateByDefault: false,
    includeDiffByDefault: false,
    logger: noopLog
  });

  const ensureRes = service.ensureProject({
    format: project.format,
    name: project.name ?? 'fixture',
    match: 'none',
    onMissing: 'create'
  });
  assert.equal(ensureRes.ok, true);

  engine.sim.loadProject({
    format: project.format,
    name: project.name ?? null,
    formatId: project.formatId ?? null,
    textureResolution: project.textureResolution ?? null,
    uvPixelsPerBlock: project.uvPixelsPerBlock,
    cubes: project.cubes ?? [],
    textures: project.textures ?? []
  });

  return { engine, service, dispatcher };
};

