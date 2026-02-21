import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_PREFIX = 'ak1';
const TOKEN_VERSION = 1;

export interface McpApiKeyTokenIssueInput {
  workspaceId: string;
  accountId: string;
  keyId: string;
  issuedAtSec?: number;
  expiresAtSec?: number;
}

export interface McpApiKeyTokenClaims {
  workspaceId: string;
  accountId: string;
  keyId: string;
  issuedAtSec: number;
  expiresAtSec: number | null;
}

type RawClaims = {
  v: number;
  wid: string;
  aid: string;
  kid: string;
  iat: number;
  exp?: number;
};

type VerifyResult =
  | {
      ok: true;
      claims: McpApiKeyTokenClaims;
    }
  | {
      ok: false;
      reason: 'invalid' | 'expired';
    };

const toTokenPayload = (claims: RawClaims): string => Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');

const fromTokenPayload = (value: string): unknown => {
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  return JSON.parse(decoded) as unknown;
};

const toSignature = (payload: string, signingSecret: string): string =>
  createHmac('sha256', signingSecret).update(`${TOKEN_PREFIX}.${payload}`).digest('base64url');

const hasValidSignature = (payload: string, signature: string, signingSecret: string): boolean => {
  try {
    const expectedBytes = Buffer.from(toSignature(payload, signingSecret), 'base64url');
    const actualBytes = Buffer.from(signature, 'base64url');
    if (actualBytes.length === 0 || expectedBytes.length !== actualBytes.length) {
      return false;
    }
    return timingSafeEqual(expectedBytes, actualBytes);
  } catch {
    return false;
  }
};

const normalizeClaims = (value: unknown): McpApiKeyTokenClaims | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const raw = value as Partial<RawClaims>;
  if (raw.v !== TOKEN_VERSION) {
    return null;
  }
  if (typeof raw.wid !== 'string' || raw.wid.trim().length === 0) {
    return null;
  }
  if (typeof raw.aid !== 'string' || raw.aid.trim().length === 0) {
    return null;
  }
  if (typeof raw.kid !== 'string' || raw.kid.trim().length === 0) {
    return null;
  }
  if (typeof raw.iat !== 'number' || !Number.isInteger(raw.iat) || raw.iat <= 0) {
    return null;
  }
  if (raw.exp !== undefined && (typeof raw.exp !== 'number' || !Number.isInteger(raw.exp) || raw.exp <= 0)) {
    return null;
  }
  return {
    workspaceId: raw.wid,
    accountId: raw.aid,
    keyId: raw.kid,
    issuedAtSec: raw.iat,
    expiresAtSec: typeof raw.exp === 'number' ? raw.exp : null
  };
};

export const issueMcpApiKeyToken = (input: McpApiKeyTokenIssueInput, signingSecret: string): string => {
  const issuedAtSec =
    typeof input.issuedAtSec === 'number' && Number.isInteger(input.issuedAtSec) && input.issuedAtSec > 0
      ? input.issuedAtSec
      : Math.floor(Date.now() / 1000);

  const claims: RawClaims = {
    v: TOKEN_VERSION,
    wid: input.workspaceId,
    aid: input.accountId,
    kid: input.keyId,
    iat: issuedAtSec,
    ...(typeof input.expiresAtSec === 'number' && Number.isInteger(input.expiresAtSec) && input.expiresAtSec > 0
      ? { exp: input.expiresAtSec }
      : {})
  };

  const payload = toTokenPayload(claims);
  const signature = toSignature(payload, signingSecret);
  return `${TOKEN_PREFIX}.${payload}.${signature}`;
};

export const verifyMcpApiKeyToken = (token: string, signingSecret: string): VerifyResult => {
  const normalized = token.trim();
  if (!normalized) {
    return {
      ok: false,
      reason: 'invalid'
    };
  }

  const parts = normalized.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    return {
      ok: false,
      reason: 'invalid'
    };
  }

  const payload = parts[1] ?? '';
  const signature = parts[2] ?? '';
  if (!payload || !signature || !hasValidSignature(payload, signature, signingSecret)) {
    return {
      ok: false,
      reason: 'invalid'
    };
  }

  try {
    const claims = normalizeClaims(fromTokenPayload(payload));
    if (!claims) {
      return {
        ok: false,
        reason: 'invalid'
      };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (claims.expiresAtSec !== null && claims.expiresAtSec <= nowSec) {
      return {
        ok: false,
        reason: 'expired'
      };
    }

    return {
      ok: true,
      claims
    };
  } catch {
    return {
      ok: false,
      reason: 'invalid'
    };
  }
};
