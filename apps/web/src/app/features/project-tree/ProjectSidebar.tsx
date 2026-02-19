import {
  Check,
  ChevronDown,
  FilePlus2,
  FolderPlus,
  Monitor,
  Moon,
  RefreshCw,
  Sun
} from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import type { ProjectTreeSnapshot, StreamStatus } from '../../../lib/dashboardModel';
import type { ThemeMode } from '../../../lib/theme';
import { cn } from '../../../lib/utils';
import styles from '../../page.module.css';
import {
  collectFolderIds,
  type DragEntity,
  isSameInsertionTarget,
  resolveInsertionTarget,
  type TreeInsertionTarget,
  toTreeLookup
} from './projectTreeDnd';
import { renderProjectTreeNode, type TreeMenuState } from './projectTreeNodeRenderer';

const THEME_OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'system', label: 'System', Icon: Monitor }
];

export interface SidebarMutationHandlers {
  onCreateFolder: (parentFolderId: string | null) => Promise<void>;
  onCreateProject: (parentFolderId: string | null) => Promise<void>;
  onRenameFolder: (folderId: string, currentName: string) => Promise<void>;
  onRenameProject: (projectId: string, currentName: string) => Promise<void>;
  onDeleteFolder: (folderId: string, currentName: string) => Promise<void>;
  onDeleteProject: (projectId: string, currentName: string) => Promise<void>;
  onMoveFolder: (folderId: string, parentFolderId: string | null, index?: number) => Promise<void>;
  onMoveProject: (projectId: string, parentFolderId: string | null, index?: number) => Promise<void>;
}

export interface ProjectSidebarProps extends SidebarMutationHandlers {
  projectTree: ProjectTreeSnapshot;
  selectedProjectId: string | null;
  streamStatus: StreamStatus;
  mutationBusy: boolean;
  mutationError: string | null;
  onRetryProjectLoad: () => void;
  onSelectProject: (projectId: string) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}

export const ProjectSidebar = memo(function ProjectSidebar({
  projectTree,
  selectedProjectId,
  streamStatus,
  mutationBusy,
  mutationError,
  onRetryProjectLoad,
  onSelectProject,
  onThemeModeChange,
  themeMode,
  onCreateFolder,
  onCreateProject,
  onRenameFolder,
  onRenameProject,
  onDeleteFolder,
  onDeleteProject,
  onMoveFolder,
  onMoveProject
}: ProjectSidebarProps) {
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [dropInsertion, setDropInsertion] = useState<TreeInsertionTarget | null>(null);
  const [openTreeMenu, setOpenTreeMenu] = useState<TreeMenuState>(null);
  const dragEntityRef = useRef<DragEntity>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);

  const treeLookup = useMemo(() => toTreeLookup(projectTree), [projectTree]);
  const selectedTheme = useMemo(
    () => THEME_OPTIONS.find((option) => option.mode === themeMode) ?? THEME_OPTIONS[2],
    [themeMode]
  );

  useEffect(() => {
    if (!themeMenuOpen) {
      return;
    }

    const handleOutsidePointer = (event: PointerEvent) => {
      if (!themeMenuRef.current?.contains(event.target as Node)) {
        setThemeMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setThemeMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [themeMenuOpen]);

  useEffect(() => {
    if (!openTreeMenu) {
      return;
    }

    const handleOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-tree-menu-root="true"]')) {
        return;
      }
      setOpenTreeMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenTreeMenu(null);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openTreeMenu]);

  useEffect(() => {
    const folderIds = new Set<string>();
    collectFolderIds(projectTree.roots, folderIds);
    setCollapsedFolders((prev) => {
      const next: Record<string, boolean> = {};
      for (const folderId of folderIds) {
        if (prev[folderId]) {
          next[folderId] = true;
        }
      }
      return next;
    });
  }, [projectTree]);

  const resetDragState = () => {
    dragEntityRef.current = null;
    setDropInsertion(null);
  };

  const resolveTarget = (
    kind: 'folder' | 'project',
    id: string,
    clientY: number,
    rowElement: HTMLDivElement
  ): TreeInsertionTarget | null => resolveInsertionTarget(treeLookup, kind, id, clientY, rowElement);

  const applyDropInsertion = async (target: TreeInsertionTarget | null) => {
    const drag = dragEntityRef.current;
    resetDragState();
    if (!drag || !target) {
      return;
    }

    if (drag.kind === 'folder' && target.rowKey === `folder:${drag.id}`) {
      return;
    }

    if (drag.kind === 'project' && target.rowKey === `project:${drag.id}`) {
      return;
    }

    if (drag.kind === 'folder') {
      await onMoveFolder(drag.id, target.parentFolderId, target.index);
      return;
    }

    await onMoveProject(drag.id, target.parentFolderId, target.index);
  };

  return (
    <aside className={cn('sidebarArea', styles.sidebarArea)}>
      <Card className={cn('h-full border-border/75', styles.sidebarCard, styles.leftSidebarCard)}>
        <CardHeader className={styles.sidebarHeader}>
          <div className={styles.sidebarTopRow}>
            <div className={styles.sidebarBrand}>
              <div className={cn('relative shrink-0 overflow-hidden border border-border/70 bg-background/80', styles.logoFrame)}>
                <img alt="Ashfox" src="/favicon-32x32.png" width={32} height={32} className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <CardTitle className={styles.sidebarTitle}>Ashfox</CardTitle>
              </div>
            </div>
          </div>

          <div className={styles.sidebarToolbar}>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onRetryProjectLoad}
              aria-label="프로젝트 트리 새로고침"
              title="새로고침"
              className={styles.sidebarToolButton}
              disabled={mutationBusy}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', mutationBusy && 'animate-spin')} />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => {
                void onCreateFolder(null);
              }}
              aria-label="루트 폴더 생성"
              title="폴더 생성"
              className={styles.sidebarToolButton}
              disabled={mutationBusy}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => {
                void onCreateProject(null);
              }}
              aria-label="루트 프로젝트 생성"
              title="프로젝트 생성"
              className={styles.sidebarToolButton}
              disabled={mutationBusy}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className={cn('flex min-h-0 flex-1 flex-col', styles.sidebarContent)}>
          <div
            className={cn(styles.treeScroller, dropInsertion?.rowKey === null && styles.treeRootDropTarget)}
            onDragOver={(event) => {
              event.preventDefault();
              if (event.target !== event.currentTarget) {
                return;
              }
              setDropInsertion((prev) => {
                const nextTarget: TreeInsertionTarget = {
                  rowKey: null,
                  position: 'root-end',
                  parentFolderId: null,
                  index: projectTree.roots.length
                };
                return isSameInsertionTarget(prev, nextTarget) ? prev : nextTarget;
              });
            }}
            onDragLeave={(event) => {
              const nextTarget = event.relatedTarget as Node | null;
              if (nextTarget && event.currentTarget.contains(nextTarget)) {
                return;
              }
              setDropInsertion((prev) => (prev?.rowKey === null ? null : prev));
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (event.target !== event.currentTarget) {
                return;
              }
              const target: TreeInsertionTarget = {
                rowKey: null,
                position: 'root-end',
                parentFolderId: null,
                index: projectTree.roots.length
              };
              void applyDropInsertion(target);
            }}
          >
            {projectTree.roots.length > 0 ? (
              projectTree.roots.map((node) =>
                renderProjectTreeNode(node, {
                  selectedProjectId,
                  streamStatus,
                  mutationBusy,
                  collapsedFolders,
                  setCollapsedFolders,
                  dropInsertion,
                  setDropInsertion,
                  openTreeMenu,
                  setOpenTreeMenu,
                  dragEntityRef,
                  resolveInsertionTarget: resolveTarget,
                  applyDropInsertion,
                  resetDragState,
                  onSelectProject,
                  onCreateFolder,
                  onCreateProject,
                  onRenameFolder,
                  onRenameProject,
                  onDeleteFolder,
                  onDeleteProject
                })
              )
            ) : (
              <p className={cn(styles.treeEmptyText, styles.emptyCenteredMessage)}>
                프로젝트/폴더가 없습니다. 새 항목을 만들어 주세요.
              </p>
            )}
          </div>

          {mutationError ? <p className={styles.sidebarErrorText}>{mutationError}</p> : null}

          <div className={styles.sidebarFooter}>
            <div className={styles.sidebarFooterActions}>
              <div ref={themeMenuRef} className={styles.themeDropdown}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={themeMenuOpen}
                  aria-label="테마 선택"
                  onClick={() => setThemeMenuOpen((prev) => !prev)}
                  className={cn(styles.themeTrigger, styles.themeTriggerFooter)}
                >
                  <selectedTheme.Icon className="h-3.5 w-3.5" />
                  <ChevronDown className={cn('h-3.5 w-3.5', styles.themeChevron, themeMenuOpen && styles.themeChevronOpen)} />
                </button>

                {themeMenuOpen ? (
                  <div role="menu" aria-label="테마 설정" className={styles.themeMenu}>
                    {THEME_OPTIONS.map(({ mode, label, Icon }) => {
                      const isActive = mode === themeMode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          className={cn(styles.themeMenuItem, isActive && styles.themeMenuItemActive)}
                          onClick={() => {
                            onThemeModeChange(mode);
                            setThemeMenuOpen(false);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="flex-1 text-left">{label}</span>
                          {isActive ? <Check className="h-4 w-4" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
});

ProjectSidebar.displayName = 'ProjectSidebar';
