import { readBlockbenchGlobals } from '../../types/blockbench';
import { ToolError } from '../../types';
import { HostPort } from '../../ports/host';
import { ADAPTER_PLUGINS_DEVRELOAD_UNAVAILABLE } from '../../shared/messages';

const DEFAULT_DELAY_MS = 100;
const MAX_DELAY_MS = 10_000;

export class BlockbenchHost implements HostPort {
  schedulePluginReload(delayMs: number): ToolError | null {
    const globals = readBlockbenchGlobals();
    const plugins = globals.Plugins;
    if (typeof plugins?.devReload !== 'function') {
      return { code: 'not_implemented', message: ADAPTER_PLUGINS_DEVRELOAD_UNAVAILABLE };
    }
    const devReload = plugins.devReload;
    const safeDelay = normalizeDelay(delayMs);
    const run = () => {
      devReload();
    };
    if (typeof setTimeout === 'function') {
      setTimeout(run, safeDelay);
    } else {
      run();
    }
    return null;
  }
}

const normalizeDelay = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_DELAY_MS;
  const rounded = Math.max(0, Math.trunc(value));
  return Math.min(rounded, MAX_DELAY_MS);
};
