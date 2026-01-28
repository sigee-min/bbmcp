import { PLUGIN_ID } from '../config';
import type { Capabilities } from '../types';
import type { ReadGlobals, ServerSettings } from './types';
import {
  PLUGIN_UI_CAPABILITIES_TITLE,
  PLUGIN_UI_DEVRELOAD_UNAVAILABLE,
  PLUGIN_UI_ENDPOINT_MESSAGE,
  PLUGIN_UI_PLUGIN_STATE_TITLE,
  PLUGIN_UI_PROMPT_HOST,
  PLUGIN_UI_PROMPT_PATH,
  PLUGIN_UI_PROMPT_PORT,
  PLUGIN_UI_UNLOADED
} from './messages';

export const registerDebugMenu = (deps: { readGlobals: ReadGlobals; capabilities: Capabilities }) => {
  const globals = deps.readGlobals();
  const blockbench = globals.Blockbench;
  const menuBar = globals.MenuBar;
  if (!blockbench || !menuBar) return;
  const action = {
    id: `${PLUGIN_ID}_debug_capabilities`,
    name: 'bbmcp: show capabilities',
    icon: 'info',
    click: () => {
      blockbench.textPrompt?.(PLUGIN_UI_CAPABILITIES_TITLE, JSON.stringify(deps.capabilities, null, 2), () => {});
    }
  };
  menuBar.addAction(action, 'help');
};

export const registerDevReloadAction = (deps: { readGlobals: ReadGlobals }) => {
  const globals = deps.readGlobals();
  const blockbench = globals.Blockbench;
  const menuBar = globals.MenuBar;
  const plugins = globals.Plugins;
  if (!blockbench || !menuBar) return;
  const action = {
    id: `${PLUGIN_ID}_dev_reload`,
    name: 'bbmcp: dev reload plugins',
    icon: 'refresh',
    click: () => {
      if (typeof plugins?.devReload === 'function') {
        plugins.devReload();
        blockbench.showQuickMessage?.(PLUGIN_UI_UNLOADED, 1200);
      } else {
        blockbench.showQuickMessage?.(PLUGIN_UI_DEVRELOAD_UNAVAILABLE, 1200);
      }
    }
  };
  menuBar.addAction(action, 'help');
};

export const registerInspectorAction = (deps: { readGlobals: ReadGlobals }) => {
  const globals = deps.readGlobals();
  const menuBar = globals.MenuBar;
  const blockbench = globals.Blockbench;
  if (!menuBar || !blockbench) return;
  const action = {
    id: `${PLUGIN_ID}_inspect_plugins`,
    name: 'bbmcp: log plugin state',
    icon: 'search',
    click: () => {
      const plugins = deps.readGlobals().Plugins;
      const path = plugins?.path;
      const registered = plugins?.registered;
      const payload = {
        path: path ?? null,
        registeredKeys: registered ? Object.keys(registered) : null
      };
      blockbench.textPrompt?.(PLUGIN_UI_PLUGIN_STATE_TITLE, JSON.stringify(payload, null, 2), () => {});
    }
  };
  menuBar.addAction(action, 'help');
};

export const registerServerConfigAction = (deps: {
  readGlobals: ReadGlobals;
  serverConfig: ServerSettings;
  restartServer: () => void;
}) => {
  const globals = deps.readGlobals();
  const menuBar = globals.MenuBar;
  const blockbench = globals.Blockbench;
  if (!menuBar || !blockbench) return;
  const action = {
    id: `${PLUGIN_ID}_server_config`,
    name: 'bbmcp: set MCP endpoint',
    icon: 'settings',
    click: async () => {
      const host = await blockbench.textPrompt?.(PLUGIN_UI_PROMPT_HOST, deps.serverConfig.host, () => {});
      if (typeof host === 'string' && host.length > 0) {
        deps.serverConfig.host = host;
      }
      const portStr = await blockbench.textPrompt?.(PLUGIN_UI_PROMPT_PORT, String(deps.serverConfig.port), () => {});
      const portNum = parseInt(portStr ?? `${deps.serverConfig.port}`, 10);
      if (!Number.isNaN(portNum)) {
        deps.serverConfig.port = portNum;
      }
      const path = await blockbench.textPrompt?.(PLUGIN_UI_PROMPT_PATH, deps.serverConfig.path, () => {});
      if (typeof path === 'string' && path.length > 0) {
        deps.serverConfig.path = path.startsWith('/') ? path : `/${path}`;
      }
      deps.restartServer();
      blockbench.showQuickMessage?.(
        PLUGIN_UI_ENDPOINT_MESSAGE(deps.serverConfig.host, deps.serverConfig.port, deps.serverConfig.path),
        1500
      );
    }
  };
  menuBar.addAction(action, 'help');
};
