import type { BlockbenchGlobals } from '../types/blockbench';

export type ReadGlobals = () => BlockbenchGlobals;

export type EndpointConfig = {
  host: string;
  port: number;
  path: string;
};



