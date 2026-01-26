import type { McpToolProfile } from '../mcp/types';

export type SidecarLaunchConfig = {
  host: string;
  port: number;
  path: string;
  execPath?: string;
  toolProfile?: McpToolProfile;
};
