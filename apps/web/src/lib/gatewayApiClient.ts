import { buildGatewayApiUrl } from './gatewayApi';

export const GATEWAY_UNAVAILABLE_CODE = 'gateway_unavailable';
export const GATEWAY_UNAVAILABLE_MESSAGE = '백엔드 연결이 필요합니다. gateway 서버를 실행한 뒤 다시 시도해 주세요.';

const DEFAULT_FALLBACK_MESSAGE = '요청을 처리하지 못했습니다.';
const NETWORK_ERROR_PATTERN = /(fetch failed|failed to fetch|networkerror|network request failed|load failed)/i;

type ApiRecord = Record<string, unknown>;

export interface GatewayApiEnvelope {
  ok?: boolean;
  code?: string;
  message?: string;
}

export interface GatewayApiParseOptions {
  fallbackMessage?: string;
  codeMessages?: Record<string, string>;
  requireAppOk?: boolean;
}

const toObjectRecord = (value: unknown): ApiRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as ApiRecord;
};

const parsePayloadFromText = (rawText: string): unknown => {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return { message: trimmed };
  }
};

const toPayloadCode = (payload: unknown): string | null => {
  const record = toObjectRecord(payload);
  if (!record) {
    return null;
  }
  const code = record.code;
  if (typeof code !== 'string') {
    return null;
  }
  const normalized = code.trim();
  return normalized.length > 0 ? normalized : null;
};

const toPayloadMessage = (payload: unknown): string | null => {
  const record = toObjectRecord(payload);
  if (!record) {
    return null;
  }
  const message = record.message;
  if (typeof message !== 'string') {
    return null;
  }
  const normalized = message.trim();
  return normalized.length > 0 ? normalized : null;
};

const resolveFallbackMessage = (status: number, fallbackMessage?: string): string => {
  if (typeof fallbackMessage === 'string' && fallbackMessage.trim().length > 0) {
    return fallbackMessage.trim();
  }
  return `Request failed (${status})`;
};

const resolveResponseErrorMessage = (
  payload: unknown,
  status: number,
  options?: Pick<GatewayApiParseOptions, 'fallbackMessage' | 'codeMessages'>
): string => {
  const code = toPayloadCode(payload);
  if (code) {
    if (options?.codeMessages && options.codeMessages[code]) {
      return options.codeMessages[code];
    }
    if (code === GATEWAY_UNAVAILABLE_CODE) {
      return GATEWAY_UNAVAILABLE_MESSAGE;
    }
  }
  if (status === 503) {
    return GATEWAY_UNAVAILABLE_MESSAGE;
  }
  const message = toPayloadMessage(payload);
  if (message) {
    return message;
  }
  return resolveFallbackMessage(status, options?.fallbackMessage);
};

const isPayloadOk = (payload: unknown): boolean => {
  const record = toObjectRecord(payload);
  return record?.ok === true;
};

export const parseGatewayApiResponse = async <T>(
  response: Response,
  options?: GatewayApiParseOptions
): Promise<T> => {
  const rawText = await response.text();
  const payload = parsePayloadFromText(rawText);
  const requireAppOk = options?.requireAppOk !== false;

  if (!response.ok || (requireAppOk && !isPayloadOk(payload))) {
    throw new Error(resolveResponseErrorMessage(payload, response.status, options));
  }

  return payload as T;
};

export const resolveGatewayRequestErrorMessage = (
  error: unknown,
  fallbackMessage: string = DEFAULT_FALLBACK_MESSAGE
): string => {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0) {
      if (NETWORK_ERROR_PATTERN.test(message)) {
        return GATEWAY_UNAVAILABLE_MESSAGE;
      }
      return message;
    }
  }
  return fallbackMessage;
};

export const requestGatewayApi = async <T>(
  path: string,
  init?: RequestInit,
  options?: GatewayApiParseOptions
): Promise<T> => {
  try {
    const response = await fetch(buildGatewayApiUrl(path), init);
    return await parseGatewayApiResponse<T>(response, options);
  } catch (error) {
    throw new Error(resolveGatewayRequestErrorMessage(error, options?.fallbackMessage ?? DEFAULT_FALLBACK_MESSAGE));
  }
};
