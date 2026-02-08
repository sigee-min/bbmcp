import { ToolError } from '@ashfox/contracts/types/internal';

export interface HostPort {
  schedulePluginReload(delayMs: number): ToolError | null;
}



