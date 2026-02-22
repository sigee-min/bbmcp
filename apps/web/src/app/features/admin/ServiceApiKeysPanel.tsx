import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ServiceApiKeyRecord } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import { WorkspaceDialogListItem, WorkspaceDialogListShell } from '../workspace/WorkspaceDialogList';
import { WorkspacePanelSection } from '../workspace/WorkspacePanelSection';

interface ServiceApiKeysPanelProps {
  apiKeys: readonly ServiceApiKeyRecord[];
  busy: boolean;
  canManageApiKeys: boolean;
  onCreateApiKey: (input: { name: string; expiresAt?: string }) => Promise<{ apiKey: ServiceApiKeyRecord; secret: string }>;
  onRevokeApiKey: (keyId: string) => Promise<void>;
}

const MAX_SERVICE_API_KEYS_PER_ACCOUNT = 10;

const toDateLabel = (value: string | null | undefined): string => {
  if (!value) {
    return '-';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }
  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const copyToClipboard = async (value: string): Promise<void> => {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return;
  }
  await navigator.clipboard.writeText(value);
};

export function ServiceApiKeysPanel({
  apiKeys,
  busy,
  canManageApiKeys,
  onCreateApiKey,
  onRevokeApiKey
}: ServiceApiKeysPanelProps) {
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [createdSecret, setCreatedSecret] = useState<{ keyPrefix: string; secret: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const activeCount = useMemo(() => apiKeys.filter((apiKey) => !apiKey.revokedAt).length, [apiKeys]);
  const disabled = busy || pending || !canManageApiKeys;
  const canCreate = !disabled && name.trim().length > 0 && activeCount < MAX_SERVICE_API_KEYS_PER_ACCOUNT;
  const meta = disabled
    ? `활성 ${activeCount}/${MAX_SERVICE_API_KEYS_PER_ACCOUNT} · 처리 중`
    : `활성 ${activeCount}/${MAX_SERVICE_API_KEYS_PER_ACCOUNT}`;

  const handleCopy = async (token: string, value: string) => {
    try {
      await copyToClipboard(value);
      setCopiedToken(token);
      window.setTimeout(() => {
        setCopiedToken((current) => (current === token ? null : current));
      }, 1200);
    } catch {
      setCopiedToken(null);
    }
  };

  return (
    <WorkspacePanelSection
      framed={false}
      readContent={
        <div className={styles.workspacePanelSection}>
          <form
            className={styles.workspaceInputRow}
            onSubmit={(event) => {
              event.preventDefault();
              if (!canCreate) {
                return;
              }
              setPending(true);
              void onCreateApiKey({
                name: name.trim(),
                ...(expiresAt.trim().length > 0 ? { expiresAt: expiresAt.trim() } : {})
              })
                .then((created) => {
                  setCreatedSecret({
                    keyPrefix: created.apiKey.keyPrefix,
                    secret: created.secret
                  });
                  setName('');
                  setExpiresAt('');
                })
                .finally(() => {
                  setPending(false);
                });
            }}
          >
            <input
              type="text"
              className={styles.workspaceInput}
              value={name}
              disabled={disabled}
              onChange={(event) => setName(event.target.value)}
              placeholder="API 키 이름"
              aria-label="서비스 API 키 이름"
              maxLength={96}
            />
            <input
              type="datetime-local"
              className={styles.workspaceInput}
              value={expiresAt}
              disabled={disabled}
              onChange={(event) => setExpiresAt(event.target.value)}
              aria-label="서비스 API 키 만료일"
            />
            <button
              type="submit"
              className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
              aria-label="서비스 API 키 발급"
              title="서비스 API 키 발급"
              disabled={!canCreate}
            >
              <Plus className={styles.workspaceIcon} aria-hidden />
            </button>
          </form>

          {createdSecret ? (
            <div className={styles.workspaceTagRow}>
              <span className={styles.workspaceTag}>새 키 발급됨</span>
              <span className={styles.workspaceTag}>{createdSecret.keyPrefix}</span>
              <button
                type="button"
                className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                onClick={() => {
                  void handleCopy('created-secret', createdSecret.secret);
                }}
                aria-label="새 서비스 API 키 복사"
                title="새 서비스 API 키 복사"
              >
                {copiedToken === 'created-secret' ? (
                  <Check className={styles.workspaceIcon} aria-hidden />
                ) : (
                  <Copy className={styles.workspaceIcon} aria-hidden />
                )}
              </button>
            </div>
          ) : null}

          <WorkspaceDialogListShell
            title="서비스 API 키"
            meta={meta}
            icon={<KeyRound aria-hidden />}
          >
            {apiKeys.length > 0 ? (
              apiKeys.map((apiKey) => {
                const isRevoked = Boolean(apiKey.revokedAt);
                const copyToken = `prefix:${apiKey.keyId}`;
                return (
                  <WorkspaceDialogListItem
                    key={apiKey.keyId}
                    main={
                      <>
                        <div className={styles.workspaceAclTitleRow}>
                          <p className={styles.workspaceListItemTitle}>{apiKey.name}</p>
                          <span
                            className={cn(
                              styles.workspaceApiKeyStateBadge,
                              isRevoked ? styles.workspaceApiKeyStateBadgeRevoked : styles.workspaceApiKeyStateBadgeActive
                            )}
                          >
                            {isRevoked ? '폐기됨' : '활성'}
                          </span>
                        </div>
                        <div className={styles.workspaceTagRow}>
                          <span className={styles.workspaceTag}>{apiKey.keyPrefix}</span>
                          <span className={styles.workspaceTag}>생성 {toDateLabel(apiKey.createdAt)}</span>
                          <span className={styles.workspaceTag}>만료 {toDateLabel(apiKey.expiresAt)}</span>
                          <span className={styles.workspaceTag}>마지막 사용 {toDateLabel(apiKey.lastUsedAt)}</span>
                        </div>
                      </>
                    }
                    actions={
                      <>
                        <button
                          type="button"
                          className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                          aria-label={`${apiKey.name} 접두사 복사`}
                          title="접두사 복사"
                          onClick={() => {
                            void handleCopy(copyToken, apiKey.keyPrefix);
                          }}
                        >
                          {copiedToken === copyToken ? (
                            <Check className={styles.workspaceIcon} aria-hidden />
                          ) : (
                            <Copy className={styles.workspaceIcon} aria-hidden />
                          )}
                        </button>
                        <button
                          type="button"
                          className={cn(styles.workspaceGhostButton, styles.workspaceDangerButton, styles.workspaceIconButton)}
                          aria-label={`${apiKey.name} 폐기`}
                          title="API 키 폐기"
                          disabled={disabled || isRevoked}
                          onClick={() => {
                            void onRevokeApiKey(apiKey.keyId);
                          }}
                        >
                          <Trash2 className={styles.workspaceIcon} aria-hidden />
                        </button>
                      </>
                    }
                  />
                );
              })
            ) : (
              <div className={styles.workspaceListEmpty}>
                <p className={styles.workspacePanelHint}>발급된 서비스 API 키가 없습니다.</p>
              </div>
            )}
          </WorkspaceDialogListShell>
        </div>
      }
    />
  );
}
