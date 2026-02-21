import { Check, Github, Mail, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ServiceSettingsView } from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import { WorkspacePanelSection } from '../workspace/WorkspacePanelSection';

interface ServiceIntegrationsPanelProps {
  settings: ServiceSettingsView | null;
  busy: boolean;
  canEditConfig: boolean;
  onSaveSmtp: (input: {
    enabled: boolean;
    host: string;
    port: number | null;
    secure: boolean;
    username: string;
    password: string;
    fromEmail: string;
    fromName: string;
  }) => Promise<void>;
  onSaveGithub: (input: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    scopes: string;
  }) => Promise<void>;
}

const toStringOrEmpty = (value: string | null | undefined): string => value ?? '';

const toPortString = (value: number | null | undefined): string => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '');

const normalizePort = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
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

export function ServiceIntegrationsPanel({
  settings,
  busy,
  canEditConfig,
  onSaveSmtp,
  onSaveGithub
}: ServiceIntegrationsPanelProps) {
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpSaving, setSmtpSaving] = useState(false);

  const [githubEnabled, setGithubEnabled] = useState(false);
  const [githubClientId, setGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [githubCallbackUrl, setGithubCallbackUrl] = useState('');
  const [githubScopes, setGithubScopes] = useState('read:user user:email');
  const [githubSaving, setGithubSaving] = useState(false);

  useEffect(() => {
    if (!settings) {
      return;
    }
    setSmtpEnabled(settings.smtp.enabled);
    setSmtpHost(toStringOrEmpty(settings.smtp.host));
    setSmtpPort(toPortString(settings.smtp.port));
    setSmtpSecure(settings.smtp.secure);
    setSmtpUsername(toStringOrEmpty(settings.smtp.username));
    setSmtpPassword('');
    setSmtpFromEmail(toStringOrEmpty(settings.smtp.fromEmail));
    setSmtpFromName(toStringOrEmpty(settings.smtp.fromName));

    setGithubEnabled(settings.githubAuth.enabled);
    setGithubClientId(toStringOrEmpty(settings.githubAuth.clientId));
    setGithubClientSecret('');
    setGithubCallbackUrl(toStringOrEmpty(settings.githubAuth.callbackUrl));
    setGithubScopes(toStringOrEmpty(settings.githubAuth.scopes) || 'read:user user:email');
  }, [settings]);

  const disabled = busy || smtpSaving || githubSaving || !canEditConfig;
  const smtpDirty = useMemo(() => {
    if (!settings) {
      return false;
    }
    return (
      smtpEnabled !== settings.smtp.enabled ||
      smtpHost !== toStringOrEmpty(settings.smtp.host) ||
      normalizePort(smtpPort) !== settings.smtp.port ||
      smtpSecure !== settings.smtp.secure ||
      smtpUsername !== toStringOrEmpty(settings.smtp.username) ||
      smtpPassword.trim().length > 0 ||
      smtpFromEmail !== toStringOrEmpty(settings.smtp.fromEmail) ||
      smtpFromName !== toStringOrEmpty(settings.smtp.fromName)
    );
  }, [
    settings,
    smtpEnabled,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUsername,
    smtpPassword,
    smtpFromEmail,
    smtpFromName
  ]);

  const githubDirty = useMemo(() => {
    if (!settings) {
      return false;
    }
    return (
      githubEnabled !== settings.githubAuth.enabled ||
      githubClientId !== toStringOrEmpty(settings.githubAuth.clientId) ||
      githubClientSecret.trim().length > 0 ||
      githubCallbackUrl !== toStringOrEmpty(settings.githubAuth.callbackUrl) ||
      githubScopes !== toStringOrEmpty(settings.githubAuth.scopes)
    );
  }, [settings, githubEnabled, githubClientId, githubClientSecret, githubCallbackUrl, githubScopes]);

  if (!settings) {
    return (
      <WorkspacePanelSection
        framed={false}
        readContent={
          <div className={styles.workspaceListEmpty}>
            <p className={styles.workspacePanelHint}>시스템 설정을 불러오지 못했습니다.</p>
          </div>
        }
      />
    );
  }

  return (
    <WorkspacePanelSection
      framed={false}
      readContent={
        <div className={styles.workspacePanelSection}>
          <form
            className={styles.workspacePanelCard}
            onSubmit={(event) => {
              event.preventDefault();
              if (!smtpDirty || disabled) {
                return;
              }
              setSmtpSaving(true);
              void onSaveSmtp({
                enabled: smtpEnabled,
                host: smtpHost,
                port: normalizePort(smtpPort),
                secure: smtpSecure,
                username: smtpUsername,
                password: smtpPassword,
                fromEmail: smtpFromEmail,
                fromName: smtpFromName
              })
                .then(() => {
                  setSmtpPassword('');
                })
                .finally(() => {
                  setSmtpSaving(false);
                });
            }}
          >
            <div className={styles.workspaceAclTitleRow}>
              <div className={styles.workspaceRoleHeadingMain}>
                <Mail className={styles.workspaceInlineIcon} aria-hidden />
                <h3 className={styles.workspacePanelCardTitle}>SMTP</h3>
              </div>
              <div className={styles.workspaceTagRow}>
                <span className={styles.workspaceTag}>updated {toDateLabel(settings.smtp.updatedAt)}</span>
                <span className={styles.workspaceTag}>{settings.smtp.hasPassword ? '비밀번호 등록됨' : '비밀번호 없음'}</span>
              </div>
            </div>
            <div className={styles.workspaceInputRow}>
              <label className={styles.workspaceCheckboxItem}>
                <input type="checkbox" checked={smtpEnabled} disabled={disabled} onChange={(event) => setSmtpEnabled(event.target.checked)} />
                enabled
              </label>
              <label className={styles.workspaceCheckboxItem}>
                <input type="checkbox" checked={smtpSecure} disabled={disabled} onChange={(event) => setSmtpSecure(event.target.checked)} />
                secure
              </label>
            </div>
            <div className={styles.workspaceInputRow}>
              <input
                type="text"
                className={styles.workspaceInput}
                value={smtpHost}
                disabled={disabled}
                placeholder="SMTP host"
                onChange={(event) => setSmtpHost(event.target.value)}
                aria-label="SMTP host"
              />
              <input
                type="number"
                className={styles.workspaceInput}
                value={smtpPort}
                disabled={disabled}
                placeholder="SMTP port"
                onChange={(event) => setSmtpPort(event.target.value)}
                aria-label="SMTP port"
              />
            </div>
            <div className={styles.workspaceInputRow}>
              <input
                type="text"
                className={styles.workspaceInput}
                value={smtpUsername}
                disabled={disabled}
                placeholder="SMTP username"
                onChange={(event) => setSmtpUsername(event.target.value)}
                aria-label="SMTP username"
              />
              <input
                type="password"
                className={styles.workspaceInput}
                value={smtpPassword}
                disabled={disabled}
                placeholder={settings.smtp.hasPassword ? 'SMTP password (변경시에만 입력)' : 'SMTP password'}
                onChange={(event) => setSmtpPassword(event.target.value)}
                aria-label="SMTP password"
              />
            </div>
            <div className={styles.workspaceInputRow}>
              <input
                type="text"
                className={styles.workspaceInput}
                value={smtpFromEmail}
                disabled={disabled}
                placeholder="from email"
                onChange={(event) => setSmtpFromEmail(event.target.value)}
                aria-label="SMTP from email"
              />
              <input
                type="text"
                className={styles.workspaceInput}
                value={smtpFromName}
                disabled={disabled}
                placeholder="from name"
                onChange={(event) => setSmtpFromName(event.target.value)}
                aria-label="SMTP from name"
              />
            </div>
            <div className={styles.workspaceFormActions}>
              <button
                type="button"
                className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                aria-label="SMTP 변경 취소"
                disabled={disabled || !smtpDirty}
                onClick={() => {
                  setSmtpEnabled(settings.smtp.enabled);
                  setSmtpHost(toStringOrEmpty(settings.smtp.host));
                  setSmtpPort(toPortString(settings.smtp.port));
                  setSmtpSecure(settings.smtp.secure);
                  setSmtpUsername(toStringOrEmpty(settings.smtp.username));
                  setSmtpPassword('');
                  setSmtpFromEmail(toStringOrEmpty(settings.smtp.fromEmail));
                  setSmtpFromName(toStringOrEmpty(settings.smtp.fromName));
                }}
              >
                <X className={styles.workspaceIcon} aria-hidden />
              </button>
              <button
                type="submit"
                className={cn(styles.workspacePrimaryButton, styles.workspaceIconButton)}
                aria-label="SMTP 변경 저장"
                disabled={disabled || !smtpDirty}
              >
                <Check className={styles.workspaceIcon} aria-hidden />
              </button>
            </div>
          </form>

          <form
            className={styles.workspacePanelCard}
            onSubmit={(event) => {
              event.preventDefault();
              if (!githubDirty || disabled) {
                return;
              }
              setGithubSaving(true);
              void onSaveGithub({
                enabled: githubEnabled,
                clientId: githubClientId,
                clientSecret: githubClientSecret,
                callbackUrl: githubCallbackUrl,
                scopes: githubScopes
              })
                .then(() => {
                  setGithubClientSecret('');
                })
                .finally(() => {
                  setGithubSaving(false);
                });
            }}
          >
            <div className={styles.workspaceAclTitleRow}>
              <div className={styles.workspaceRoleHeadingMain}>
                <Github className={styles.workspaceInlineIcon} aria-hidden />
                <h3 className={styles.workspacePanelCardTitle}>GitHub OAuth</h3>
              </div>
              <div className={styles.workspaceTagRow}>
                <span className={styles.workspaceTag}>updated {toDateLabel(settings.githubAuth.updatedAt)}</span>
                <span className={styles.workspaceTag}>{settings.githubAuth.hasClientSecret ? '시크릿 등록됨' : '시크릿 없음'}</span>
              </div>
            </div>
            <div className={styles.workspaceInputRow}>
              <label className={styles.workspaceCheckboxItem}>
                <input
                  type="checkbox"
                  checked={githubEnabled}
                  disabled={disabled}
                  onChange={(event) => setGithubEnabled(event.target.checked)}
                />
                enabled
              </label>
            </div>
            <div className={styles.workspaceInputRow}>
              <input
                type="text"
                className={styles.workspaceInput}
                value={githubClientId}
                disabled={disabled}
                placeholder="client id"
                onChange={(event) => setGithubClientId(event.target.value)}
                aria-label="GitHub client id"
              />
              <input
                type="password"
                className={styles.workspaceInput}
                value={githubClientSecret}
                disabled={disabled}
                placeholder={settings.githubAuth.hasClientSecret ? 'client secret (변경시에만 입력)' : 'client secret'}
                onChange={(event) => setGithubClientSecret(event.target.value)}
                aria-label="GitHub client secret"
              />
            </div>
            <div className={styles.workspaceInputRow}>
              <input
                type="text"
                className={styles.workspaceInput}
                value={githubCallbackUrl}
                disabled={disabled}
                placeholder="callback url"
                onChange={(event) => setGithubCallbackUrl(event.target.value)}
                aria-label="GitHub callback url"
              />
              <input
                type="text"
                className={styles.workspaceInput}
                value={githubScopes}
                disabled={disabled}
                placeholder="scopes"
                onChange={(event) => setGithubScopes(event.target.value)}
                aria-label="GitHub scopes"
              />
            </div>
            <div className={styles.workspaceFormActions}>
              <button
                type="button"
                className={cn(styles.workspaceGhostButton, styles.workspaceIconButton)}
                aria-label="GitHub 설정 변경 취소"
                disabled={disabled || !githubDirty}
                onClick={() => {
                  setGithubEnabled(settings.githubAuth.enabled);
                  setGithubClientId(toStringOrEmpty(settings.githubAuth.clientId));
                  setGithubClientSecret('');
                  setGithubCallbackUrl(toStringOrEmpty(settings.githubAuth.callbackUrl));
                  setGithubScopes(toStringOrEmpty(settings.githubAuth.scopes) || 'read:user user:email');
                }}
              >
                <X className={styles.workspaceIcon} aria-hidden />
              </button>
              <button
                type="submit"
                className={cn(styles.workspacePrimaryButton, styles.workspaceIconButton)}
                aria-label="GitHub 설정 변경 저장"
                disabled={disabled || !githubDirty}
              >
                <Check className={styles.workspaceIcon} aria-hidden />
              </button>
            </div>
          </form>
        </div>
      }
      inputContent={
        canEditConfig ? null : (
          <p className={styles.workspacePanelHint}>시스템 설정 편집은 system_admin만 가능합니다.</p>
        )
      }
    />
  );
}
