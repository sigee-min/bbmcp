import type { Dispatcher } from '../types';
import type { LogLevel } from '../logging';
import { ConsoleLogger } from '../logging';
import type { ResourceStore } from '../ports/resources';
import type { ToolRegistry } from '../transport/mcp/tools';
import { startServer } from '../server';
import { SidecarProcess } from '../sidecar/SidecarProcess';
import type { SidecarLaunchConfig } from '../sidecar/types';
import { readGlobals } from '../adapters/blockbench/blockbenchUtils';
import { PLUGIN_ID } from '../config';
import {
  PLUGIN_LOG_INLINE_SERVER_UNAVAILABLE,
  PLUGIN_LOG_SERVER_WEB_MODE,
  PLUGIN_LOG_SIDECAR_FAILED
} from './messages';
import type { EndpointConfig } from './types';

export type RuntimeServerState = {
  sidecar: SidecarProcess | null;
  inlineServerStop: (() => void) | null;
};

export const restartServer = (args: {
  endpointConfig: EndpointConfig;
  dispatcher: Dispatcher | null;
  logLevel: LogLevel;
  resourceStore: ResourceStore;
  toolRegistry: ToolRegistry;
  state: RuntimeServerState;
}): RuntimeServerState => {
  let { sidecar, inlineServerStop } = args.state;
  if (sidecar) {
    sidecar.stop();
    sidecar = null;
  }
  if (inlineServerStop) {
    inlineServerStop();
    inlineServerStop = null;
  }

  const logger = new ConsoleLogger(PLUGIN_ID, () => args.logLevel);
  const globals = readGlobals();
  const blockbench = globals.Blockbench;
  if (blockbench?.isWeb) {
    logger.warn(PLUGIN_LOG_SERVER_WEB_MODE);
    return { sidecar, inlineServerStop };
  }

  if (args.dispatcher) {
    const inlineStop = startServer(
      { host: args.endpointConfig.host, port: args.endpointConfig.port, path: args.endpointConfig.path },
      args.dispatcher,
      logger,
      args.resourceStore,
      args.toolRegistry
    );
    if (inlineStop) {
      inlineServerStop = inlineStop;
      return { sidecar, inlineServerStop };
    }
    logger.warn(PLUGIN_LOG_INLINE_SERVER_UNAVAILABLE);
    const endpoint: SidecarLaunchConfig = {
      host: args.endpointConfig.host,
      port: args.endpointConfig.port,
      path: args.endpointConfig.path
    };
    sidecar = new SidecarProcess(endpoint, args.dispatcher, logger);
    if (!sidecar.start()) {
      sidecar = null;
      logger.warn(PLUGIN_LOG_SIDECAR_FAILED);
    }
  }

  return { sidecar, inlineServerStop };
};
