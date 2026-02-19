import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import styles from './AccountSecurityDialog.module.css';

type AccountSecurityUser = {
  accountId: string;
  displayName: string;
  email: string;
  localLoginId: string | null;
  githubLogin: string | null;
};

type AccountSecurityUpdateInput = {
  loginId?: string;
  password?: string;
  passwordConfirm?: string;
};

type AccountSecurityDialogProps = {
  open: boolean;
  user: AccountSecurityUser | null;
  busy: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  onClose: () => void;
  onSubmit: (input: AccountSecurityUpdateInput) => Promise<void>;
};

const normalizeLoginId = (value: string): string => value.trim().toLowerCase();

const buildValidationError = (input: {
  baselineLoginId: string;
  loginId: string;
  password: string;
  passwordConfirm: string;
}): string | null => {
  const nextLoginId = normalizeLoginId(input.loginId);
  const loginChanged = nextLoginId !== input.baselineLoginId;
  const passwordEntered = input.password.length > 0 || input.passwordConfirm.length > 0;

  if (!loginChanged && !passwordEntered) {
    return '변경할 항목이 없습니다.';
  }

  if (loginChanged && nextLoginId.length === 0) {
    return '로그인 아이디를 입력해주세요.';
  }

  if (passwordEntered) {
    if (input.password.length === 0 || input.passwordConfirm.length === 0) {
      return '새 비밀번호와 확인을 모두 입력해주세요.';
    }
    if (input.password !== input.passwordConfirm) {
      return '비밀번호 확인이 일치하지 않습니다.';
    }
    if (nextLoginId.length === 0) {
      return '비밀번호 설정 전 로그인 아이디를 입력해주세요.';
    }
  }

  return null;
};

export function AccountSecurityDialog({
  open,
  user,
  busy,
  errorMessage,
  successMessage,
  onClose,
  onSubmit
}: AccountSecurityDialogProps) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  useEffect(() => {
    if (!open || !user) {
      return;
    }
    setLoginId(user.localLoginId ?? user.githubLogin?.toLowerCase() ?? '');
    setPassword('');
    setPasswordConfirm('');
  }, [open, user]);

  const baselineLoginId = useMemo(() => normalizeLoginId(user?.localLoginId ?? ''), [user?.localLoginId]);
  const validationError = buildValidationError({
    baselineLoginId,
    loginId,
    password,
    passwordConfirm
  });

  const submit = async () => {
    if (!user || validationError) {
      return;
    }
    const nextLoginId = normalizeLoginId(loginId);
    const payload: AccountSecurityUpdateInput = {};
    if (nextLoginId !== baselineLoginId) {
      payload.loginId = nextLoginId;
    }
    if (password.length > 0 || passwordConfirm.length > 0) {
      payload.password = password;
      payload.passwordConfirm = passwordConfirm;
    }
    await onSubmit(payload);
    setPassword('');
    setPasswordConfirm('');
  };

  if (!open) {
    return null;
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="계정 보안"
        className={styles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 className={styles.title}>계정 보안</h2>
            <p className={styles.subtitle}>로컬 로그인 아이디/비밀번호를 선택적으로 설정하거나 변경할 수 있습니다.</p>
            <p className={styles.meta}>
              {user?.displayName ?? '사용자'} · {user?.email ?? '-'}
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="닫기">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className={styles.body}>
          <label className={styles.label} htmlFor="account-security-login-id">
            로그인 아이디
          </label>
          <input
            id="account-security-login-id"
            className={styles.input}
            autoComplete="username"
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder="login id"
            disabled={busy}
          />
          <label className={styles.label} htmlFor="account-security-password">
            새 비밀번호
          </label>
          <input
            id="account-security-password"
            className={styles.input}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="8자 이상"
            type="password"
            disabled={busy}
          />
          <label className={styles.label} htmlFor="account-security-password-confirm">
            새 비밀번호 확인
          </label>
          <input
            id="account-security-password-confirm"
            className={styles.input}
            autoComplete="new-password"
            value={passwordConfirm}
            onChange={(event) => setPasswordConfirm(event.target.value)}
            placeholder="비밀번호 재입력"
            type="password"
            disabled={busy}
          />
          <p className={styles.hint}>비밀번호를 바꾸지 않으려면 비워두세요.</p>
          {validationError ? <p className={styles.validationError}>{validationError}</p> : null}
          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
          {successMessage ? <p className={styles.success}>{successMessage}</p> : null}
        </div>
        <footer className={styles.footer}>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={busy}>
            닫기
          </button>
          <button type="button" className={styles.primaryButton} onClick={() => void submit()} disabled={busy || Boolean(validationError)}>
            저장
          </button>
        </footer>
      </section>
    </div>
  );
}
