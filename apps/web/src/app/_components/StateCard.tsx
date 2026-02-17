import styles from './StateCard.module.css';

interface StateCardProps {
  title: string;
  message: string;
  tone?: 'normal' | 'error';
  code?: string | null;
  actionLabel?: string;
  onAction?: () => void;
}

export const StateCard = ({
  title,
  message,
  tone = 'normal',
  code = null,
  actionLabel,
  onAction
}: StateCardProps) => (
  <main className={styles.card}>
    <h1 className={styles.title}>{title}</h1>
    {code ? (
      <p className={`${styles.message} ${tone === 'error' ? styles.error : ''}`.trim()}>
        {message} (<code className={styles.code}>{code}</code>)
      </p>
    ) : (
      <p className={`${styles.message} ${tone === 'error' ? styles.error : ''}`.trim()}>{message}</p>
    )}
    {actionLabel && onAction ? (
      <button type="button" className={styles.actionButton} onClick={onAction}>
        {actionLabel}
      </button>
    ) : null}
  </main>
);
