import { Bone, Clapperboard, Cuboid, Image } from 'lucide-react';
import { memo } from 'react';

import { Card, CardContent } from '../../../components/ui/card';
import {
  INSPECTOR_TABS,
  type AnimationSummary,
  type HierarchyNode,
  type InspectorTabId,
  type ProjectSnapshot,
  type ProjectTextureAtlas
} from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';

export interface HierarchyRow {
  node: HierarchyNode;
  depth: number;
}

interface InspectorSidebarProps {
  selectedProject: ProjectSnapshot | null;
  hierarchyRows: readonly HierarchyRow[];
  selectedAnimationId: string | null;
  textures: readonly ProjectTextureAtlas[];
  selectedTextureId: string | null;
  activeTab: InspectorTabId;
  onSelectTab: (tabId: InspectorTabId) => void;
  onSelectAnimation: (animationId: string, defaultLoop: boolean) => void;
  onSelectTexture: (textureId: string) => void;
}

export const InspectorSidebar = memo(function InspectorSidebar({
  selectedProject,
  hierarchyRows,
  selectedAnimationId,
  textures,
  selectedTextureId,
  activeTab,
  onSelectTab,
  onSelectAnimation,
  onSelectTexture
}: InspectorSidebarProps) {
  return (
    <aside className={cn('inspectorArea', styles.inspectorArea)}>
      <Card className={cn('flex h-full flex-col border-border/75', styles.sidebarCard, styles.rightSidebarCard)}>
        <CardContent className={cn('flex min-h-0 flex-1 flex-col', styles.inspectorContent)}>
          <div className={styles.tabRail}>
            {INSPECTOR_TABS.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  className={cn(styles.inspectorTab, selected && styles.inspectorTabActive)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className={styles.inspectorMain}>
            {activeTab === 'hierarchy' ? (
              hierarchyRows.length > 0 ? (
                <div className={styles.hierarchyTree}>
                  {hierarchyRows.map(({ node, depth }) => (
                    <div
                      key={node.id}
                      className={styles.hierarchyTreeRow}
                      style={{ paddingInlineStart: `${0.4 + depth * 0.72}rem` }}
                    >
                      <div className={styles.hierarchyTreeMain}>
                        {node.kind === 'bone' ? (
                          <Bone className={cn('h-3.5 w-3.5', styles.hierarchyBoneIcon)} />
                        ) : (
                          <Cuboid className={cn('h-3.5 w-3.5', styles.hierarchyCubeIcon)} />
                        )}
                        <span className={styles.hierarchyTreeName}>{node.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={cn(styles.emptyCenteredMessage, 'text-sm text-muted-foreground')}>하이어라키 데이터가 없습니다.</p>
              )
            ) : selectedProject && selectedProject.animations.length > 0 ? (
              <div className={styles.animationList} data-overlay-anchor="animation">
                {selectedProject.animations.map((animation: AnimationSummary) => (
                  <button
                    key={animation.id}
                    type="button"
                    className={cn(styles.animationItem, selectedAnimationId === animation.id && styles.animationItemActive)}
                    onClick={() => onSelectAnimation(animation.id, animation.loop)}
                  >
                    <div className={styles.animationMain}>
                      <Clapperboard className={styles.animationIcon} />
                      <p className={styles.animationName}>{animation.name}</p>
                    </div>
                    <p className={styles.animationMeta}>
                      {animation.length}s · {animation.loop ? 'loop' : 'once'}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className={cn(styles.emptyCenteredMessage, 'text-sm text-muted-foreground')}>애니메이션 데이터가 없습니다.</p>
            )}
          </div>
          <div className={styles.texturePanel} data-overlay-anchor="texture">
            <div className={styles.texturePanelHeader}>
              <span className={styles.texturePanelTitle}>
                <Image className="h-3.5 w-3.5" />
                텍스처
              </span>
              <span className={styles.texturePanelCount}>{textures.length}</span>
            </div>
            <div className={styles.texturePanelBody}>
              {textures.length > 0 ? (
                textures.map((texture) => {
                  const selected = texture.textureId === selectedTextureId;
                  return (
                    <button
                      key={texture.textureId}
                      type="button"
                      className={cn(styles.textureItem, selected && styles.textureItemActive)}
                      onClick={() => onSelectTexture(texture.textureId)}
                    >
                      <span className={styles.textureThumb}>
                        {texture.imageDataUrl ? (
                          <img
                            src={texture.imageDataUrl}
                            alt=""
                            className={styles.textureThumbImage}
                            loading="lazy"
                            draggable={false}
                          />
                        ) : (
                          <Image className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <span className={styles.textureItemLabel}>{texture.name}</span>
                    </button>
                  );
                })
              ) : (
                <p className={cn(styles.emptyCenteredMessage, 'text-sm text-muted-foreground')}>텍스처 데이터가 없습니다.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
});

InspectorSidebar.displayName = 'InspectorSidebar';
