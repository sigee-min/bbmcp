import { PLUGIN_ID } from '../config';
import type { EndpointConfig, ReadGlobals } from './types';
import { normalizeHost, normalizePath, normalizePort } from '../shared/endpoint';

type SettingType = 'text' | 'number';

export const registerEndpointSettings = (deps: {
  readGlobals: ReadGlobals;
  config: EndpointConfig;
  restartServer: () => void;
}) => {
  const globals = deps.readGlobals();
  const SettingCtor = globals.Setting;
  if (typeof SettingCtor === 'undefined') return;

  const category = `${PLUGIN_ID}: Server`;
  const applyHost = (value: unknown, shouldRestart = true) => {
    const next = normalizeHost(value) ?? deps.config.host;
    if (next === deps.config.host) return;
    deps.config.host = next;
    if (shouldRestart) deps.restartServer();
  };
  const applyPort = (value: unknown, shouldRestart = true) => {
    const next = normalizePort(value) ?? deps.config.port;
    if (next === deps.config.port) return;
    deps.config.port = next;
    if (shouldRestart) deps.restartServer();
  };
  const applyPath = (value: unknown, shouldRestart = true) => {
    const next = normalizePath(value, deps.config.path);
    if (next === deps.config.path) return;
    deps.config.path = next;
    if (shouldRestart) deps.restartServer();
  };

  const registerSetting = (
    id: 'host' | 'port' | 'path',
    name: string,
    type: SettingType,
    value: string | number,
    apply: (value: unknown, shouldRestart?: boolean) => void
  ) => {
    const setting = new SettingCtor(`${PLUGIN_ID}_${id}`, {
      name,
      category,
      plugin: PLUGIN_ID,
      type,
      value,
      onChange: (next: unknown) => apply(next)
    });
    apply(setting?.value ?? value, false);
  };

  registerSetting('host', 'MCP Host', 'text', deps.config.host, applyHost);
  registerSetting('port', 'MCP Port', 'number', deps.config.port, applyPort);
  registerSetting('path', 'MCP Path', 'text', deps.config.path, applyPath);
};
