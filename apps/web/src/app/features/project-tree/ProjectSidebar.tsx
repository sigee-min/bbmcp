import {
  Check,
  ChevronDown,
  FilePlus2,
  FolderPlus,
  Monitor,
  Moon,
  RefreshCw,
  Settings2,
  Sun
} from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';

import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import type { ProjectTreeSnapshot, StreamStatus, WorkspaceSummary } from '../../../lib/dashboardModel';
import type { ThemeMode } from '../../../lib/theme';
import { cn } from '../../../lib/utils';
import { useDismissibleMenu } from '../../_hooks/useDismissibleMenu';
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

type SidebarMenuState =
  | { kind: 'none' }
  | { kind: 'theme' }
  | { kind: 'workspace' }
  | { kind: 'settings' }
  | { kind: 'tree'; menu: NonNullable<TreeMenuState> };

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
  workspaces: readonly WorkspaceSummary[];
  selectedWorkspaceId: string;
  workspaceLoading: boolean;
  workspaceError: string | null;
  canManageWorkspace: boolean;
  mutationBusy: boolean;
  mutationError: string | null;
  onRetryProjectLoad: () => void;
  onOpenWorkspaceSettings: () => void;
  onOpenAccountSecurity: () => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectProject: (projectId: string) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}

export const ProjectSidebar = memo(function ProjectSidebar({
  projectTree,
  selectedProjectId,
  streamStatus,
  workspaces,
  selectedWorkspaceId,
  workspaceLoading,
  workspaceError,
  canManageWorkspace,
  mutationBusy,
  mutationError,
  onRetryProjectLoad,
  onOpenWorkspaceSettings,
  onOpenAccountSecurity,
  onSelectWorkspace,
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
  const [menuState, setMenuState] = useState<SidebarMenuState>({ kind: 'none' });
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [dropInsertion, setDropInsertion] = useState<TreeInsertionTarget | null>(null);
  const dragEntityRef = useRef<DragEntity>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);

  const themeMenuOpen = menuState.kind === 'theme';
  const workspaceMenuOpen = menuState.kind === 'workspace';
  const settingsMenuOpen = menuState.kind === 'settings';
  const openTreeMenu: TreeMenuState = menuState.kind === 'tree' ? menuState.menu : null;

  const treeLookup = useMemo(() => toTreeLookup(projectTree), [projectTree]);
  const selectedTheme = useMemo(
    () => THEME_OPTIONS.find((option) => option.mode === themeMode) ?? THEME_OPTIONS[2],
    [themeMode]
  );
  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.workspaceId === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );

  const closeMenus = useCallback(() => {
    setMenuState({ kind: 'none' });
  }, []);

  const toggleMenu = useCallback((kind: 'theme' | 'workspace' | 'settings') => {
    setMenuState((prev) => (prev.kind === kind ? { kind: 'none' } : { kind }));
  }, []);

  const setOpenTreeMenu: Dispatch<SetStateAction<TreeMenuState>> = useCallback((value) => {
    setMenuState((prev) => {
      const previousTreeMenu = prev.kind === 'tree' ? prev.menu : null;
      const nextTreeMenu = typeof value === 'function' ? value(previousTreeMenu) : value;
      if (!nextTreeMenu) {
        return { kind: 'none' };
      }
      return { kind: 'tree', menu: nextTreeMenu };
    });
  }, []);

  const containsThemeMenuTarget = useCallback(
    (target: EventTarget | null) => target instanceof Node && Boolean(themeMenuRef.current?.contains(target)),
    []
  );
  const containsWorkspaceMenuTarget = useCallback(
    (target: EventTarget | null) => target instanceof Node && Boolean(workspaceMenuRef.current?.contains(target)),
    []
  );
  const containsSettingsMenuTarget = useCallback(
    (target: EventTarget | null) => target instanceof Node && Boolean(settingsMenuRef.current?.contains(target)),
    []
  );
  const containsTreeMenuTarget = useCallback(
    (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('[data-tree-menu-root="true"]')),
    []
  );

  useDismissibleMenu({
    open: themeMenuOpen,
    containsTarget: containsThemeMenuTarget,
    onDismiss: closeMenus
  });
  useDismissibleMenu({
    open: workspaceMenuOpen,
    containsTarget: containsWorkspaceMenuTarget,
    onDismiss: closeMenus
  });
  useDismissibleMenu({
    open: settingsMenuOpen,
    containsTarget: containsSettingsMenuTarget,
    onDismiss: closeMenus
  });
  useDismissibleMenu({
    open: openTreeMenu !== null,
    containsTarget: containsTreeMenuTarget,
    onDismiss: closeMenus
  });

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

          <div className={styles.workspaceSelectorWrap}>
            <p className={styles.workspaceSelectorLabel}>Workspace</p>
            <div ref={workspaceMenuRef} className={styles.workspaceSelector}>
              <button
                type="button"
                className={styles.workspaceSelectorButton}
                aria-haspopup="menu"
                aria-expanded={workspaceMenuOpen}
                disabled={workspaceLoading || workspaces.length === 0}
                onClick={() => toggleMenu('workspace')}
              >
                <span className={styles.workspaceSelectorName}>
                  {selectedWorkspace?.name ?? (workspaceLoading ? '워크스페이스 불러오는 중…' : '워크스페이스 없음')}
                </span>
                <ChevronDown className={cn('h-3.5 w-3.5', styles.themeChevron, workspaceMenuOpen && styles.themeChevronOpen)} />
              </button>
              {workspaceMenuOpen ? (
                <div role="menu" aria-label="워크스페이스 목록" className={styles.workspaceSelectorMenu}>
                  {workspaces.map((workspace) => {
                    const isActive = workspace.workspaceId === selectedWorkspaceId;
                    return (
                      <button
                        key={workspace.workspaceId}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        className={cn(styles.workspaceSelectorItem, isActive && styles.workspaceSelectorItemActive)}
                        onClick={() => {
                          onSelectWorkspace(workspace.workspaceId);
                          closeMenus();
                        }}
                      >
                        <span className={styles.workspaceSelectorItemName}>{workspace.name}</span>
                        <span className={styles.workspaceSelectorItemMode}>{workspace.mode}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {workspaceError ? <p className={styles.sidebarErrorText}>{workspaceError}</p> : null}
          </div>

          <div className={styles.sidebarFooter}>
            <div ref={settingsMenuRef} className={styles.themeDropdown}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={settingsMenuOpen}
                aria-label="사이드바 설정"
                onClick={() => toggleMenu('settings')}
                className={cn(styles.themeTrigger, styles.themeTriggerFooter)}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
              {settingsMenuOpen ? (
                <div role="menu" aria-label="사이드바 설정 메뉴" className={styles.themeMenu}>
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.themeMenuItem}
                    onClick={() => {
                      onOpenAccountSecurity();
                      closeMenus();
                    }}
                  >
                    계정 보안
                  </button>
                  {canManageWorkspace ? (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.themeMenuItem}
                      onClick={() => {
                        onOpenWorkspaceSettings();
                        closeMenus();
                      }}
                    >
                      워크스페이스 관리
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className={styles.sidebarFooterActions}>
              <div ref={themeMenuRef} className={styles.themeDropdown}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={themeMenuOpen}
                  aria-label="테마 선택"
                  onClick={() => toggleMenu('theme')}
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
                            closeMenus();
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
