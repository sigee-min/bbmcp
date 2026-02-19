export const AUTO_PROVISIONED_WORKSPACE_PREFIX = 'ws_auto_';

const normalizeAccountId = (value: string): string => value.trim().toLowerCase();

const toSlugSegment = (value: string): string => {
  const slug = value
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/g, '')
    .replace(/-+$/g, '');
  if (slug.length === 0) {
    return 'user';
  }
  return slug.slice(0, 18);
};

const toFNV1aFingerprint = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(6, '0').slice(0, 6);
};

export const toAutoProvisionedWorkspaceId = (accountId: string): string => {
  const normalizedAccountId = normalizeAccountId(accountId);
  const slug = toSlugSegment(normalizedAccountId);
  const fingerprint = toFNV1aFingerprint(normalizedAccountId || 'user');
  return `${AUTO_PROVISIONED_WORKSPACE_PREFIX}${slug}-${fingerprint}`;
};

export const isAutoProvisionedWorkspaceId = (workspaceId: string): boolean =>
  workspaceId.startsWith(AUTO_PROVISIONED_WORKSPACE_PREFIX);

export const toAutoProvisionedWorkspaceName = (displayName: string): string => {
  const normalized = displayName.trim();
  if (normalized.length === 0) {
    return 'My Workspace';
  }
  return `${normalized.slice(0, 72)} Workspace`;
};
