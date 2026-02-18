const DEFAULT_GATEWAY_API_BASE_URL = '/api';

const normalizeBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_GATEWAY_API_BASE_URL;
  }
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
};

const readBaseUrlFromProcessEnv = (): string | undefined => {
  if (typeof process === 'undefined' || !process.env) {
    return undefined;
  }
  return process.env.VITE_ASHFOX_GATEWAY_API_BASE_URL;
};

const configuredGatewayApiBaseUrl = readBaseUrlFromProcessEnv() ?? DEFAULT_GATEWAY_API_BASE_URL;

export const gatewayApiBaseUrl = normalizeBaseUrl(configuredGatewayApiBaseUrl);

export const buildGatewayApiUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${gatewayApiBaseUrl}${normalizedPath}`;
};
