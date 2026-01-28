import type { ToolErrorResponse } from '../types';

export class ProxyPipelineAbort extends Error {
  readonly response: ToolErrorResponse;

  constructor(response: ToolErrorResponse) {
    super('Proxy pipeline aborted');
    this.response = response;
  }
}

export const isProxyPipelineAbort = (err: unknown): err is ProxyPipelineAbort =>
  err instanceof ProxyPipelineAbort;
