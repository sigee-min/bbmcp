import type { ReactElement } from 'react';

import { INSPECTOR_TABS, type InspectorTabId, type ProjectSnapshot, type HierarchyNode } from '../../lib/dashboardModel';
import styles from './InspectorPanel.module.css';

interface InspectorPanelProps {
  activeTab: InspectorTabId;
  selectedProject: ProjectSnapshot | null;
  onSelectTab: (tabId: InspectorTabId) => void;
}

const renderHierarchyRows = (nodes: readonly HierarchyNode[], depth = 0): ReactElement[] => {
  const rows: ReactElement[] = [];
  for (const node of nodes) {
    const hierarchyToneClass = node.kind === 'bone' ? styles.hierarchyBone : '';
    rows.push(
      <div
        key={node.id}
        className={`${styles.hierarchyRow} ${hierarchyToneClass}`.trim()}
        style={{ marginLeft: depth * 14 }}
      >
        <strong className={styles.hierarchyLabel}>{node.name}</strong>
        <span className={styles.hierarchyKind}>{node.kind}</span>
      </div>
    );
    rows.push(...renderHierarchyRows(node.children, depth + 1));
  }
  return rows;
};

export const InspectorPanel = ({ activeTab, selectedProject, onSelectTab }: InspectorPanelProps) => (
  <aside className={styles.inspector}>
    <div className={styles.tabList}>
      {INSPECTOR_TABS.map((tab) => {
        const selected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className={`${styles.tabButton} ${selected ? styles.tabButtonSelected : ''}`.trim()}
          >
            {tab.label}
          </button>
        );
      })}
    </div>

    <div className={styles.panelBody}>
      {activeTab === 'hierarchy' ? (
        selectedProject && selectedProject.hierarchy.length > 0 ? (
          <div>{renderHierarchyRows(selectedProject.hierarchy)}</div>
        ) : (
          <p className={styles.empty}>하이어라키 데이터가 없습니다.</p>
        )
      ) : selectedProject && selectedProject.animations.length > 0 ? (
        <div className={styles.animationList}>
          {selectedProject.animations.map((animation) => (
            <div key={animation.id} className={styles.animationCard}>
              <strong>{animation.name}</strong>
              <div className={styles.animationMeta}>
                length {animation.length}s · {animation.loop ? 'loop' : 'once'}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>애니메이션 데이터가 없습니다.</p>
      )}
    </div>
  </aside>
);
