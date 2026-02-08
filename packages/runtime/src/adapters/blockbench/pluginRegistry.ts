import { readBlockbenchGlobals } from '../../types/blockbench';

export const resolveRegisteredPluginPath = (pluginId: string): string | null => {
  const registered = readBlockbenchGlobals().Plugins?.registered;
  const entry = registered?.[pluginId] as { path?: string } | undefined;
  const path = entry?.path;
  return path && typeof path === 'string' ? path : null;
};


