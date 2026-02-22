import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronDown, Github, LockKeyhole, Monitor, Moon, Sun, UserRound } from 'lucide-react';
import type { ResolvedTheme, ThemeMode } from '../../../lib/theme';
import { AdaptiveMenu } from '../../_components/AdaptiveMenu';
import { useDismissibleMenu } from '../../_hooks/useDismissibleMenu';
import { ErrorNotice } from '../shared/ErrorNotice';
import styles from './AuthScreen.module.css';

const THEME_OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'system', label: 'System', Icon: Monitor }
];

type AuthScreenProps = {
  githubEnabled: boolean;
  busy: boolean;
  errorMessage: string | null;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  onThemeModeChange: (mode: ThemeMode) => void;
  onLogin: (loginId: string, password: string) => Promise<void>;
  onGitHubLogin: () => void;
};

export function AuthScreen({
  githubEnabled,
  busy,
  errorMessage,
  themeMode,
  resolvedTheme,
  onThemeModeChange,
  onLogin,
  onGitHubLogin
}: AuthScreenProps) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const themeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const showGithubLogin = githubEnabled;
  const selectedTheme = useMemo(
    () => THEME_OPTIONS.find((option) => option.mode === themeMode) ?? THEME_OPTIONS[2],
    [themeMode]
  );
  const brandLogoSrc = resolvedTheme === 'dark' ? '/logo_fullbackground_dark.png' : '/logo_fullbackground_light.png';
  const resolvedThemeLabel = themeMode === 'system' ? `System (${resolvedTheme})` : selectedTheme.label;

  const closeThemeMenu = useCallback(() => {
    setThemeMenuOpen(false);
  }, []);

  const containsThemeMenuTarget = useCallback(
    (target: EventTarget | null) => target instanceof Node && Boolean(themeMenuRef.current?.contains(target)),
    []
  );

  useDismissibleMenu({
    open: themeMenuOpen,
    containsTarget: containsThemeMenuTarget,
    onDismiss: closeThemeMenu
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onLogin(loginId, password);
  };

  return (
    <main className={styles.authShell}>
      <section className={styles.authCard} aria-label="로그인">
        <header className={styles.authBrandHeader}>
          <img src={brandLogoSrc} alt="Ashfox 로고" className={styles.authBrandLogo} />
          <div className={styles.authBrandText}>
            <span className={styles.authBrandName}>Ashfox</span>
            <p className={styles.authBrandDescription}>팀 워크플로우에 로우폴리 에셋 개발 플로우를 간편하게 통합하세요.</p>
          </div>
        </header>

        <h2 className={styles.authSectionLabel}>
          <span className={styles.authSectionLabelRow}>
            <UserRound className={styles.authSectionLabelIcon} />
            <span>로그인</span>
          </span>
        </h2>
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

        <div className={styles.authDivider} role="presentation">
          <span>or continue with GitHub</span>
        </div>

        <h2 className={styles.authSectionLabel}>
          <span className={styles.authSectionLabelRow}>
            <Github className={styles.authSectionLabelIcon} />
            <span>GitHub 로그인</span>
          </span>
        </h2>
        {showGithubLogin ? (
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
          <p className={styles.authProviderDisabled}>현재 GitHub 로그인이 비활성화되었습니다.</p>
        )}

        {errorMessage ? <ErrorNotice message={errorMessage} channel="blocking" className={styles.authErrorNotice} /> : null}

        <div className={styles.authThemeDock}>
          <div ref={themeMenuRef} className={styles.authThemeDropdown}>
            <button
              ref={themeTriggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={themeMenuOpen}
              aria-label={`테마 선택: ${resolvedThemeLabel}`}
              onClick={() => setThemeMenuOpen((open) => !open)}
              className={styles.authThemeTrigger}
            >
              <selectedTheme.Icon className={styles.authThemeTriggerIcon} />
              <ChevronDown
                className={`${styles.authThemeChevron} ${themeMenuOpen ? styles.authThemeChevronOpen : ''}`}
              />
            </button>
            <AdaptiveMenu
              open={themeMenuOpen}
              anchorRef={themeTriggerRef}
              ariaLabel="테마 설정"
              className={styles.authThemeMenu}
            >
              {THEME_OPTIONS.map(({ mode, label, Icon }) => {
                const isActive = mode === themeMode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    className={`${styles.authThemeMenuItem} ${isActive ? styles.authThemeMenuItemActive : ''}`}
                    onClick={() => {
                      onThemeModeChange(mode);
                      closeThemeMenu();
                    }}
                  >
                    <Icon className={styles.authThemeMenuItemIcon} />
                    <span className={styles.authThemeMenuItemLabel}>{label}</span>
                    {isActive ? <Check className={styles.authThemeMenuItemIcon} /> : null}
                  </button>
                );
              })}
            </AdaptiveMenu>
          </div>
        </div>
      </section>
    </main>
  );
}
