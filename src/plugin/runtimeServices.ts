import type { Capabilities, Dispatcher } from '../types';
import type { Logger } from '../logging';
import type { ToolPolicies } from '../usecases/policies';
import { computeCapabilities } from '../config';
import { ToolDispatcherImpl } from '../dispatcher';
import { ProjectSession } from '../session';
import { ProxyRouter } from '../proxy';
import { BlockbenchEditor } from '../adapters/blockbench/BlockbenchEditor';
import { BlockbenchHost } from '../adapters/blockbench/BlockbenchHost';
import { BlockbenchFormats } from '../adapters/blockbench/BlockbenchFormats';
import { BlockbenchSnapshot } from '../adapters/blockbench/BlockbenchSnapshot';
import { BlockbenchExport } from '../adapters/blockbench/BlockbenchExport';
import { BlockbenchTextureRenderer } from '../adapters/blockbench/BlockbenchTextureRenderer';
import { BlockbenchDom } from '../adapters/blockbench/BlockbenchDom';
import type { FormatOverrides } from '../services/format';
import { InMemoryResourceStore } from '../services/resources';
import { LocalTmpStore } from '../services/tmpStore';
import { ToolService } from '../usecases/ToolService';
import { buildToolRegistry } from '../mcp/tools';

export type RuntimeServices = {
  session: ProjectSession;
  capabilities: Capabilities;
  dispatcher: Dispatcher;
  proxy: ProxyRouter;
  formats: BlockbenchFormats;
};

type BuildRuntimeServicesOptions = {
  blockbenchVersion?: string;
  formatOverrides: FormatOverrides;
  policies: ToolPolicies;
  resourceStore: InMemoryResourceStore;
  logger: Logger;
};

export const buildRuntimeServices = (options: BuildRuntimeServicesOptions): RuntimeServices => {
  const session = new ProjectSession();
  const editor = new BlockbenchEditor(options.logger);
  const host = new BlockbenchHost();
  const formats = new BlockbenchFormats();
  const snapshot = new BlockbenchSnapshot(options.logger);
  const exporter = new BlockbenchExport(options.logger);
  const textureRenderer = new BlockbenchTextureRenderer();
  const dom = new BlockbenchDom();
  const tmpStore = new LocalTmpStore();
  const previewCapability = {
    pngOnly: true,
    fixedOutput: 'single' as const,
    turntableOutput: 'sequence' as const,
    response: 'content' as const
  };
  const capabilities = computeCapabilities(
    options.blockbenchVersion,
    formats.listFormats(),
    options.formatOverrides,
    previewCapability
  );
  const toolRegistry = buildToolRegistry({ includeLowLevel: Boolean(options.policies.exposeLowLevelTools) });
  capabilities.toolRegistry = { hash: toolRegistry.hash, count: toolRegistry.count };
  const service = new ToolService({
    session,
    capabilities,
    editor,
    host,
    formats,
    snapshot,
    exporter,
    textureRenderer,
    tmpStore,
    resources: options.resourceStore,
    policies: options.policies
  });
  const dispatcher = new ToolDispatcherImpl(session, capabilities, service, {
    includeStateByDefault: () => Boolean(options.policies.autoIncludeState),
    includeDiffByDefault: () => Boolean(options.policies.autoIncludeDiff),
    logger: options.logger
  });
  const proxy = new ProxyRouter(service, dom, options.logger, capabilities.limits, {
    includeStateByDefault: () => Boolean(options.policies.autoIncludeState),
    includeDiffByDefault: () => Boolean(options.policies.autoIncludeDiff)
  });

  return {
    session,
    capabilities,
    dispatcher,
    proxy,
    formats
  };
};
