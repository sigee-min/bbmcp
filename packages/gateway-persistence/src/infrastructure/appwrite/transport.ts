import { appwriteTimeoutError } from '../validation';

export type AppwriteTransportConfig = {
  baseUrl: string;
  projectId: string;
  apiKey: string;
  responseFormat: string;
  requestTimeoutMs: number;
};

export type AppwriteTransportOptions = {
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
};

type AppwriteRequestOptions = {
  body?: BodyInit;
  json?: unknown;
  headers?: Record<string, string>;
};

type AppwriteHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export const normalizeAppwriteBaseUrl = (value: string): string => value.replace(/\/+$/, '');

export const buildAppwriteError = async (response: Response, action: string): Promise<Error> => {
  const raw = (await response.text()).trim();
  if (!raw) {
    return new Error(`Appwrite ${action} failed: ${response.status} ${response.statusText}`);
  }
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; type?: unknown; code?: unknown };
    const message = typeof parsed.message === 'string' ? parsed.message : `${response.status} ${response.statusText}`;
    const type = typeof parsed.type === 'string' ? parsed.type : '';
    const code = typeof parsed.code === 'number' || typeof parsed.code === 'string' ? String(parsed.code) : '';
    const suffix = [type, code].filter(Boolean).join('/');
    return new Error(`Appwrite ${action} failed: ${message}${suffix ? ` (${suffix})` : ''}`);
  } catch {
    return new Error(`Appwrite ${action} failed: ${response.status} ${response.statusText} :: ${raw.slice(0, 300)}`);
  }
};

export const createAppwriteTransport = <TConfig extends AppwriteTransportConfig>(
  config: TConfig,
  options: AppwriteTransportOptions = {}
): {
  config: TConfig;
  request: (
    method: AppwriteHttpMethod,
    pathValue: string,
    requestOptions?: AppwriteRequestOptions
  ) => Promise<Response>;
  toError: (response: Response, action: string) => Promise<Error>;
} => {
  const normalizedConfig = {
    ...config,
    baseUrl: normalizeAppwriteBaseUrl(config.baseUrl)
  };
  const fetchImpl = options.fetchImpl ?? fetch;
  const request = async (
    method: AppwriteHttpMethod,
    pathValue: string,
    requestOptions: AppwriteRequestOptions = {}
  ): Promise<Response> => {
    const url = `${normalizedConfig.baseUrl}${pathValue}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), normalizedConfig.requestTimeoutMs);
    try {
      const headers = new Headers({
        'x-appwrite-project': normalizedConfig.projectId,
        'x-appwrite-key': normalizedConfig.apiKey,
        'x-appwrite-response-format': normalizedConfig.responseFormat
      });
      if (requestOptions.headers) {
        for (const [key, value] of Object.entries(requestOptions.headers)) {
          headers.set(key, value);
        }
      }
      let body = requestOptions.body;
      if (requestOptions.json !== undefined) {
        headers.set('content-type', 'application/json');
        body = JSON.stringify(requestOptions.json);
      }
      return await fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw appwriteTimeoutError(normalizedConfig.requestTimeoutMs, method, pathValue);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
  return {
    config: normalizedConfig as TConfig,
    request,
    toError: buildAppwriteError
  };
};
