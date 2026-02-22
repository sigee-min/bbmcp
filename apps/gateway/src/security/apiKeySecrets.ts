import { createHash } from 'node:crypto';

export const parseBearerApiKeySecret = (authorization: string | undefined): string | null => {
  if (typeof authorization !== 'string') {
    return null;
  }
  const trimmed = authorization.trim();
  if (!trimmed) {
    return null;
  }
  const matched = /^Bearer\s+(.+)$/i.exec(trimmed);
  if (!matched) {
    return null;
  }
  const secret = matched[1]?.trim();
  return secret && secret.length > 0 ? secret : null;
};

export const hashApiKeySecret = (secret: string): string =>
  createHash('sha256').update(secret).digest('hex');
