import type { ReadGlobals, EndpointConfig } from './types';
import { registerEndpointSettings } from './endpointSettings';
import { cleanupLegacySettings } from './settingsMigration';

export const registerPluginSettings = (deps: {
  readGlobals: ReadGlobals;
  endpointConfig: EndpointConfig;
  restartServer: () => void;
}) => {
  cleanupLegacySettings({ readGlobals: deps.readGlobals });
  registerEndpointSettings({
    readGlobals: deps.readGlobals,
    config: deps.endpointConfig,
    restartServer: deps.restartServer
  });
};
