import { useState, type FormEvent } from 'react';
import { Github, LockKeyhole, UserRound } from 'lucide-react';
import styles from './AuthScreen.module.css';

type AuthScreenProps = {
  githubEnabled: boolean;
  busy: boolean;
  errorMessage: string | null;
  onLogin: (loginId: string, password: string) => Promise<void>;
  onGitHubLogin: () => void;
};

export function AuthScreen({ githubEnabled, busy, errorMessage, onLogin, onGitHubLogin }: AuthScreenProps) {
  const [loginId, setLoginId] = useState('admin');
  const [password, setPassword] = useState('admin');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onLogin(loginId, password);
  };

  return (
    <main className={styles.authShell}>
      <section className={styles.authCard} aria-label="로그인">
        <div className={styles.authTitleRow}>
          <img src="/favicon-32x32.png" alt="Ashfox" className={styles.authLogo} />
          <div className={styles.authTitleBlock}>
            <h1 className={styles.authTitle}>Ashfox</h1>
            <p className={styles.authSubtitle}>Sign in to continue</p>
          </div>
        </div>
        {githubEnabled ? (
          <button
            className={styles.authGitHubButton}
            type="button"
            onClick={onGitHubLogin}
            disabled={busy}
            aria-label="GitHub로 로그인"
          >
            <Github className={styles.authGitHubIcon} />
            <span>Continue with GitHub</span>
          </button>
        ) : (
          <p className={styles.authHintMuted}>GitHub 로그인이 현재 비활성화되어 있습니다.</p>
        )}

        <div className={styles.authDivider} role="presentation">
          <span>or use local account</span>
        </div>

        <form className={styles.authForm} onSubmit={(event) => void submit(event)}>
          <label className={styles.authField}>
            <span className={styles.authFieldLabel}>Login ID</span>
            <span className={styles.authInputWrap}>
              <UserRound className={styles.authInputIcon} />
              <input
                className={styles.authInput}
                autoComplete="username"
                name="loginId"
                placeholder="login id"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                disabled={busy}
              />
            </span>
          </label>
          <label className={styles.authField}>
            <span className={styles.authFieldLabel}>Password</span>
            <span className={styles.authInputWrap}>
              <LockKeyhole className={styles.authInputIcon} />
              <input
                className={styles.authInput}
                autoComplete="current-password"
                name="password"
                placeholder="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </span>
          </label>
          <div className={styles.authButtons}>
            <button className={`${styles.authButton} ${styles.authButtonPrimary}`} type="submit" disabled={busy}>
              로컬 계정 로그인
            </button>
          </div>
        </form>
        {errorMessage ? <p className={styles.authError}>{errorMessage}</p> : null}
        <p className={styles.authHint}>초기 시스템 관리자 계정: admin / admin</p>
      </section>
    </main>
  );
}
