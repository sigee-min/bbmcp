import type { ReactNode } from 'react';

import styles from '../../page.module.css';

interface WorkspacePanelSectionProps {
  readContent: ReactNode;
  inputContent?: ReactNode;
  framed?: boolean;
}

export function WorkspacePanelSection({
  readContent,
  inputContent,
  framed = true
}: WorkspacePanelSectionProps) {
  const hasInputContent = inputContent !== null && inputContent !== undefined;
  const content = (
    <div className={styles.workspacePanelAreaBody}>
      {readContent}
      {hasInputContent ? <div className={styles.workspacePanelInlineEditor}>{inputContent}</div> : null}
    </div>
  );

  return (
    <section className={styles.workspacePanelSection}>
      {framed ? (
        <article className={styles.workspacePanelArea} aria-label="워크스페이스 설정 정보 영역">
          {content}
        </article>
      ) : (
        content
      )}
    </section>
  );
}
