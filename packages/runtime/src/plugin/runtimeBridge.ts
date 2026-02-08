import { deleteGlobalValue, readGlobalValue, writeGlobalValue } from '../shared/globalState';

export type RuntimeInstance = { cleanup: () => void; version: string };

const INSTANCE_KEY = '__ashfox_instance__';

export const claimSingleton = (args: {
  cleanup: () => void;
  version: string;
  onCleanupError?: (message: string) => void;
}) => {
  const existing = readGlobalValue(INSTANCE_KEY) as RuntimeInstance | undefined;
  if (existing?.cleanup) {
    try {
      existing.cleanup();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      args.onCleanupError?.(message);
    }
  }
  writeGlobalValue(INSTANCE_KEY, { cleanup: args.cleanup, version: args.version } satisfies RuntimeInstance);
};

export const releaseSingleton = () => {
  deleteGlobalValue(INSTANCE_KEY);
};

export const exposeBridge = (bridge: unknown, version: string) => {
  writeGlobalValue('ashfox', bridge);
  writeGlobalValue('ashfoxVersion', version);
};

export const cleanupBridge = () => {
  deleteGlobalValue('ashfox');
  deleteGlobalValue('ashfoxVersion');
};

