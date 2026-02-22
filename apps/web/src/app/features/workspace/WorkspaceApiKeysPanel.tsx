import { Check, CircleHelp, Copy, KeyRound, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { WorkspaceApiKeyRecord } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import {
  buildApiKeyGuideTemplate,
  copyTextToClipboard,
  getApiKeyGuideSubtitle,
  getApiKeyGuideTitle,
  resolveMcpEndpoint,
  type ApiKeyGuidePlatform
} from '../shared/apiKeyGuide';
import { ErrorNotice } from '../shared/ErrorNotice';
import { useErrorChannels } from '../shared/useErrorChannels';
import { WorkspaceDialogListItem, WorkspaceDialogListShell } from './WorkspaceDialogList';
import { WorkspacePanelSection } from './WorkspacePanelSection';

interface WorkspaceApiKeysPanelProps {
  apiKeys: readonly WorkspaceApiKeyRecord[];
  busy: boolean;
  canManageApiKeys: boolean;
  maxActiveKeys: number;
  onCreateApiKey: (input: { name: string; expiresAt?: string }) => Promise<{ apiKey: WorkspaceApiKeyRecord; secret: string }>;
  onRevokeApiKey: (input: { keyId: string }) => Promise<void>;
}

type CreatedSecretState = {
  keyName: string;
  keyPrefix: string;
  secret: string;
};

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

export function WorkspaceApiKeysPanel({
  apiKeys,
  busy,
  canManageApiKeys,
  maxActiveKeys,
  onCreateApiKey,
  onRevokeApiKey
}: WorkspaceApiKeysPanelProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [guideDialogOpen, setGuideDialogOpen] = useState(false);
  const [guidePlatform, setGuidePlatform] = useState<ApiKeyGuidePlatform>('codex');
  const [draftName, setDraftName] = useState('');
  const [draftExpiresAt, setDraftExpiresAt] = useState('');
  const [createdSecret, setCreatedSecret] = useState<CreatedSecretState | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const { inlineError, setChannelError, clearChannelError } = useErrorChannels();

  const activeApiKeyCount = useMemo(() => apiKeys.filter((apiKey) => !apiKey.revokedAt).length, [apiKeys]);
  const limitReached = activeApiKeyCount >= maxActiveKeys;
  const disabled = busy || !canManageApiKeys;
  const listMeta = busy
    ? `활성 ${activeApiKeyCount}/${maxActiveKeys} · 요청 처리 중`
    : !canManageApiKeys
      ? `활성 ${activeApiKeyCount}/${maxActiveKeys} · 권한 없음`
      : limitReached
        ? `활성 ${activeApiKeyCount}/${maxActiveKeys} · 상한 도달`
        : `활성 ${activeApiKeyCount}/${maxActiveKeys}`;
  const canIssue = useMemo(
    () => !disabled && !limitReached && draftName.trim().length > 0 && inlineError === null,
    [disabled, draftName, inlineError, limitReached]
  );
  const mcpEndpoint = useMemo(resolveMcpEndpoint, []);
  const guideTitle = getApiKeyGuideTitle(guidePlatform);
  const guideSubtitle = getApiKeyGuideSubtitle(guidePlatform);
  const guideTemplate = useMemo(() => buildApiKeyGuideTemplate(guidePlatform, mcpEndpoint), [guidePlatform, mcpEndpoint]);

  const closeCreateDialog = (force = false) => {
    if (busy && !force) {
      return;
    }
    setCreateDialogOpen(false);
    setDraftName('');
    setDraftExpiresAt('');
    clearChannelError('inline');
  };

  const handleCopy = async (token: string, value: string) => {
    try {
      await copyTextToClipboard(value);
      setCopiedToken(token);
      window.setTimeout(() => {
        setCopiedToken((current) => (current === token ? null : current));
      }, 1200);
    } catch {
      setCopiedToken(null);
    }
  };

  return (
    <>
      <WorkspacePanelSection
        framed={false}
        readContent={
          <WorkspaceDialogListShell
            title="API 키"
            meta={listMeta}
            icon={<KeyRound aria-hidden />}
            action={
              <div className={styles.workspaceListShellHeaderActions}>
                {canManageApiKeys ? (
                  <button
                    type="button"
                    className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                    aria-label="API 키 발급"
                    title="API 키 발급"
                    disabled={busy || limitReached}
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    <Plus className={styles.workspaceIcon} aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                  aria-label="MCP 연결 가이드 열기"
                  title="MCP 연결 가이드"
                  onClick={() => {
                    setGuidePlatform('codex');
                    setGuideDialogOpen(true);
                  }}
                >
                  <CircleHelp className={styles.workspaceIcon} aria-hidden />
                </button>
              </div>
            }
          >
            {apiKeys.length > 0 ? (
              apiKeys.map((apiKey) => {
                const isRevoked = Boolean(apiKey.revokedAt);
                const copyToken = `prefix:${apiKey.keyId}`;
                const copied = copiedToken === copyToken;
                const statusClassName = isRevoked
                  ? styles.workspaceApiKeyStateBadgeRevoked
                  : styles.workspaceApiKeyStateBadgeActive;
                return (
                  <WorkspaceDialogListItem
                    key={apiKey.keyId}
                    main={
                      <>
                        <div className={styles.workspaceAclTitleRow}>
                          <p className={styles.workspaceListItemTitle}>{apiKey.name}</p>
                          <span className={cn(styles.workspaceApiKeyStateBadge, statusClassName)}>
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
                          aria-label={`${apiKey.name} API 키 접두사 복사`}
                          title="접두사 복사"
                          onClick={() => {
                            void handleCopy(copyToken, apiKey.keyPrefix);
                          }}
                        >
                          {copied ? <Check className={styles.workspaceIcon} aria-hidden /> : <Copy className={styles.workspaceIcon} aria-hidden />}
                        </button>
                        <button
                          type="button"
                          className={cn(styles.workspaceGhostButton, styles.workspaceDangerButton, styles.workspaceIconButton)}
                          aria-label={`${apiKey.name} API 키 폐기`}
                          title="API 키 폐기"
                          disabled={disabled || isRevoked}
                          onClick={() => {
                            void onRevokeApiKey({ keyId: apiKey.keyId });
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
                <p className={styles.workspacePanelHint}>발급된 API 키가 없습니다.</p>
              </div>
            )}
          </WorkspaceDialogListShell>
        }
      />

      {createDialogOpen ? (
        <div className={styles.workspaceAclEditOverlay} role="presentation" onClick={closeCreateDialog}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label="API 키 발급"
            className={styles.workspaceAclEditDialog}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.workspaceAclEditHeader}>
              <div className={styles.workspaceAclEditTitleWrap}>
                <h3 className={styles.workspaceAclEditTitle}>API 키 발급</h3>
                  <p className={styles.workspaceAclEditSubtitle}>이름과 만료일을 입력해 새 키를 발급합니다.</p>
                </div>
              <button
                type="button"
                className={styles.workspaceAclEditCloseButton}
                onClick={closeCreateDialog}
                disabled={busy}
                aria-label="API 키 발급 닫기"
              >
                <X className={styles.workspaceIcon} aria-hidden />
              </button>
            </header>

            <form
              className={styles.workspaceAclEditForm}
              onSubmit={(event) => {
                event.preventDefault();
                if (!canIssue) {
                  return;
                }
                let expiresAt: string | undefined;
                const normalizedExpiresAt = draftExpiresAt.trim();
                if (normalizedExpiresAt.length > 0) {
                  const parsed = new Date(normalizedExpiresAt);
                  if (Number.isNaN(parsed.getTime())) {
                    setChannelError('inline', '만료일 형식이 올바르지 않습니다.');
                    return;
                  }
                  expiresAt = parsed.toISOString();
                }

                void onCreateApiKey({
                  name: draftName.trim(),
                  ...(expiresAt ? { expiresAt } : {})
                })
                  .then((result) => {
                    setCreatedSecret({
                      keyName: result.apiKey.name,
                      keyPrefix: result.apiKey.keyPrefix,
                      secret: result.secret
                    });
                    closeCreateDialog(true);
                  })
                  .catch(() => {
                    // dialog-level error message is rendered by parent
                  });
              }}
            >
              <div className={styles.workspaceAclEditBody}>
                <div className={styles.workspacePanelGroup}>
                  <p className={styles.workspacePanelLabel}>이름</p>
                  <input
                    type="text"
                    className={styles.workspaceInput}
                    placeholder="예: ci-bot"
                    value={draftName}
                    disabled={disabled}
                    onChange={(event) => {
                      setDraftName(event.target.value);
                      clearChannelError('inline');
                    }}
                    aria-label="API 키 이름 입력"
                  />
                </div>

                <div className={styles.workspacePanelGroup}>
                  <p className={styles.workspacePanelLabel}>만료일 (선택)</p>
                  <input
                    type="datetime-local"
                    className={styles.workspaceInput}
                    value={draftExpiresAt}
                    disabled={disabled}
                    onChange={(event) => {
                      setDraftExpiresAt(event.target.value);
                      clearChannelError('inline');
                    }}
                    aria-label="API 키 만료일 입력"
                  />
                </div>

                {inlineError ? (
                  <ErrorNotice message={inlineError} channel="inline" size="sm" className={styles.workspacePanelInlineError} />
                ) : null}
                {limitReached ? (
                  <p className={styles.workspacePanelHint}>활성 API 키가 상한({maxActiveKeys}개)에 도달했습니다.</p>
                ) : null}
              </div>

              <footer className={styles.workspaceAclEditFooter}>
                <button
                  type="button"
                  className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                  onClick={closeCreateDialog}
                  disabled={busy}
                  aria-label="API 키 발급 취소"
                >
                  <X className={styles.workspaceIcon} aria-hidden />
                </button>
                <button
                  type="submit"
                  className={cn(styles.workspacePrimaryButton, styles.workspaceIconButton)}
                  disabled={!canIssue}
                  aria-label="API 키 발급 저장"
                >
                  <Check className={styles.workspaceIcon} aria-hidden />
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}

      {createdSecret ? (
        <div
          className={styles.workspaceAclEditOverlay}
          role="presentation"
          onClick={() => {
            setCreatedSecret(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="API 키 발급 완료"
            className={styles.workspaceAclEditDialog}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.workspaceAclEditHeader}>
              <div className={styles.workspaceAclEditTitleWrap}>
                <h3 className={styles.workspaceAclEditTitle}>API 키 발급 완료</h3>
                <p className={styles.workspaceAclEditSubtitle}>원문 키는 지금 한 번만 확인할 수 있습니다.</p>
              </div>
              <button
                type="button"
                className={styles.workspaceAclEditCloseButton}
                onClick={() => {
                  setCreatedSecret(null);
                }}
                aria-label="API 키 발급 완료 닫기"
              >
                <X className={styles.workspaceIcon} aria-hidden />
              </button>
            </header>

            <div className={styles.workspaceAclEditBody}>
              <div className={styles.workspacePanelCard}>
                <p className={styles.workspacePanelCardTitle}>{createdSecret.keyName}</p>
                <p className={styles.workspacePanelHint}>접두사: {createdSecret.keyPrefix}</p>
                <code className={styles.workspaceApiKeySecretValue}>{createdSecret.secret}</code>
              </div>
            </div>

            <footer className={styles.workspaceAclEditFooter}>
              <button
                type="button"
                className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                onClick={() => {
                  void handleCopy('secret', createdSecret.secret);
                }}
                aria-label="발급된 API 키 복사"
              >
                {copiedToken === 'secret' ? (
                  <Check className={styles.workspaceIcon} aria-hidden />
                ) : (
                  <Copy className={styles.workspaceIcon} aria-hidden />
                )}
              </button>
              <button
                type="button"
                className={cn(styles.workspacePrimaryButton, styles.workspaceIconButton)}
                onClick={() => {
                  setCreatedSecret(null);
                }}
                aria-label="API 키 발급 완료 확인"
              >
                <Check className={styles.workspaceIcon} aria-hidden />
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {guideDialogOpen ? (
        <div
          className={styles.workspaceAclEditOverlay}
          role="presentation"
          onClick={() => {
            setGuideDialogOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="MCP 연결 가이드"
            className={styles.workspaceAclEditDialog}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.workspaceAclEditHeader}>
              <div className={styles.workspaceAclEditTitleWrap}>
                <h3 className={styles.workspaceAclEditTitle}>MCP 연결 가이드</h3>
                <p className={styles.workspaceAclEditSubtitle}>클라이언트 환경별 설정 예시</p>
              </div>
              <button
                type="button"
                className={styles.workspaceAclEditCloseButton}
                onClick={() => {
                  setGuideDialogOpen(false);
                }}
                aria-label="MCP 연결 가이드 닫기"
              >
                <X className={styles.workspaceIcon} aria-hidden />
              </button>
            </header>

            <div className={styles.workspaceAclEditBody}>
              <div className={styles.workspacePanelCard}>
                <div className={styles.workspaceGuideTabs} role="tablist" aria-label="MCP 가이드 클라이언트 탭">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={guidePlatform === 'codex'}
                    className={cn(styles.workspaceGuideTab, guidePlatform === 'codex' ? styles.workspaceGuideTabActive : null)}
                    onClick={() => {
                      setGuidePlatform('codex');
                    }}
                  >
                    Codex
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={guidePlatform === 'claude'}
                    className={cn(styles.workspaceGuideTab, guidePlatform === 'claude' ? styles.workspaceGuideTabActive : null)}
                    onClick={() => {
                      setGuidePlatform('claude');
                    }}
                  >
                    Claude
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={guidePlatform === 'gemini'}
                    className={cn(styles.workspaceGuideTab, guidePlatform === 'gemini' ? styles.workspaceGuideTabActive : null)}
                    onClick={() => {
                      setGuidePlatform('gemini');
                    }}
                  >
                    Gemini
                  </button>
                </div>
                <p className={styles.workspacePanelCardTitle}>{guideTitle}</p>
                <p className={styles.workspacePanelHint}>{guideSubtitle}</p>
                <pre className={styles.workspaceEnvSnippet}>{guideTemplate}</pre>
              </div>
            </div>

            <footer className={styles.workspaceAclEditFooter}>
              <button
                type="button"
                className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                onClick={() => {
                  void handleCopy(`mcp-guide-template:${guidePlatform}`, guideTemplate);
                }}
                aria-label="환경변수 템플릿 복사"
              >
                {copiedToken === `mcp-guide-template:${guidePlatform}` ? (
                  <Check className={styles.workspaceIcon} aria-hidden />
                ) : (
                  <Copy className={styles.workspaceIcon} aria-hidden />
                )}
              </button>
              <button
                type="button"
                className={cn(styles.workspacePrimaryButton, styles.workspaceIconButton)}
                onClick={() => {
                  setGuideDialogOpen(false);
                }}
                aria-label="MCP 연결 가이드 확인"
              >
                <Check className={styles.workspaceIcon} aria-hidden />
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
