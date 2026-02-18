import {
  Bone,
  CircleHelp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cuboid,
  FolderOpen,
  LoaderCircle,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
  Workflow
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ashfoxLogo from '../../../docs/public/favicon-32x32.png';
import { ModelPreview } from './_components/ModelPreview';
import styles from './page.module.css';
import { useDashboardStream } from './_hooks/useDashboardStream';
import { useProjectList } from './_hooks/useProjectList';
import { useThemeMode } from './_hooks/useThemeMode';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import { cn } from '../lib/utils';
import {
  INSPECTOR_TABS,
  createInitialDashboardState,
  rotateViewer,
  selectProject,
  setActiveTab,
  type DashboardErrorCode,
  type DashboardState,
  type HierarchyNode,
  type InspectorTabId,
  type ProjectSnapshot,
  type StreamStatus
} from '../lib/dashboardModel';
import type { ThemeMode } from '../lib/theme';

const streamLabel: Record<StreamStatus, string> = {
  idle: '대기 중',
  connecting: '연결 중',
  open: '연결됨',
  reconnecting: '재연결 중'
};

const errorCopy: Record<DashboardErrorCode, string> = {
  project_load_failed: '프로젝트를 불러오지 못했습니다.',
  stream_unavailable: '연결이 일시적으로 끊겼습니다. 자동으로 다시 연결하는 중입니다.'
};

const themeOptions: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'system', label: 'System', Icon: Monitor }
];

interface HierarchyRow {
  node: HierarchyNode;
  depth: number;
}

const flattenHierarchyRows = (nodes: readonly HierarchyNode[], depth = 0): HierarchyRow[] => {
  const rows: HierarchyRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    rows.push(...flattenHierarchyRows(node.children, depth + 1));
  }
  return rows;
};

interface ProjectSidebarProps {
  projects: readonly ProjectSnapshot[];
  selectedProjectId: string | null;
  streamStatus: StreamStatus;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRetryProjectLoad: () => void;
  onSelectProject: (projectId: string) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
}

const ProjectSidebar = memo(function ProjectSidebar({
  projects,
  selectedProjectId,
  streamStatus,
  collapsed,
  onToggleCollapsed,
  onRetryProjectLoad,
  onSelectProject,
  themeMode,
  onThemeModeChange
}: ProjectSidebarProps) {
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const selectedTheme = useMemo(
    () => themeOptions.find((option) => option.mode === themeMode) ?? themeOptions[2],
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

  return (
    <aside className={cn('sidebarArea', styles.sidebarArea)}>
      <Card className={cn('h-full border-border/75', styles.sidebarCard, styles.leftSidebarCard)}>
        <CardHeader className={cn(styles.sidebarHeader, collapsed && styles.sidebarHeaderCollapsed)}>
          <div className={styles.sidebarTopRow}>
            <div className={styles.sidebarBrand}>
              <div className={cn('relative shrink-0 overflow-hidden border border-border/70 bg-background/80', styles.logoFrame)}>
                <img alt="Ashfox" src={ashfoxLogo} width={32} height={32} className="h-full w-full object-contain" />
              </div>
              {!collapsed ? (
                <div className="min-w-0">
                  <CardTitle className={styles.sidebarTitle}>Ashfox</CardTitle>
                </div>
              ) : null}
            </div>
            <div className={styles.sidebarTopActions}>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={onToggleCollapsed}
                aria-label={collapsed ? '프로젝트 사이드바 펼치기' : '프로젝트 사이드바 접기'}
                aria-expanded={!collapsed}
                className="h-7 w-7"
              >
                {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className={cn('flex min-h-0 flex-1 flex-col', styles.sidebarContent, collapsed && styles.sidebarContentCollapsed)}>
          {!collapsed ? (
            <div className={styles.projectPanel}>
              <div className={styles.projectPanelHead}>
                <div className={styles.projectPanelHeadLeft}>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={onRetryProjectLoad}
                    aria-label="프로젝트 목록 새로고침"
                    title="프로젝트 목록 새로고침"
                    className={styles.queueRefreshButton}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <span>Project Queue</span>
                </div>
                <span>{projects.length}</span>
              </div>
              <div className={styles.projectList}>
                {projects.map((project) => {
                  const selected = selectedProjectId === project.projectId;
                  const projectActivity = !selected
                    ? { label: '대기', className: styles.projectStatusIdle }
                    : streamStatus === 'open'
                      ? { label: '작업 중', className: styles.projectStatusBusy }
                      : streamStatus === 'connecting' || streamStatus === 'reconnecting'
                        ? { label: '동기화', className: styles.projectStatusSync }
                        : { label: '대기', className: styles.projectStatusIdle };

                  return (
                    <button
                      key={project.projectId}
                      onClick={() => onSelectProject(project.projectId)}
                      type="button"
                      className={cn(styles.projectItem, selected && styles.projectItemActive)}
                    >
                      <span className={styles.projectName}>{project.name}</span>
                      <span className={cn(styles.projectStatus, projectActivity.className)}>{projectActivity.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className={styles.projectPanelCollapsed}>
              <div className={cn('min-h-0 space-y-2 overflow-y-auto', styles.projectListCollapsed)}>
                {projects.map((project) => {
                  const selected = selectedProjectId === project.projectId;
                  return (
                    <button
                      key={project.projectId}
                      onClick={() => onSelectProject(project.projectId)}
                      type="button"
                      title={project.name}
                      aria-label={`${project.name} 프로젝트 선택`}
                      className={cn(styles.projectChip, selected && styles.projectChipActive)}
                    >
                      {project.name.slice(0, 2).toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className={cn(styles.sidebarFooter, collapsed && styles.sidebarFooterCollapsed)}>
            {!collapsed ? (
              <div className={styles.sidebarCompactMeta}>
                <div className={styles.sidebarMetaItem} tabIndex={0}>
                  <FolderOpen className={styles.sidebarMetaIcon} />
                  <span className={styles.sidebarMetaCount}>{projects.length}</span>
                  <div className={styles.sidebarMetaHint} role="tooltip">
                    <p className={styles.sidebarMetaHintTitle}>Projects</p>
                    <p className={styles.sidebarMetaHintDesc}>현재 대시보드에 로드된 프로젝트 수</p>
                  </div>
                </div>
              </div>
            ) : null}
            <div ref={themeMenuRef} className={styles.themeDropdown}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={themeMenuOpen}
                aria-label="테마 선택"
                onClick={() => setThemeMenuOpen((prev) => !prev)}
                className={cn(
                  styles.themeTrigger,
                  styles.themeTriggerFooter,
                  collapsed && styles.themeTriggerCollapsed
                )}
              >
                <selectedTheme.Icon className="h-3.5 w-3.5" />
                {!collapsed ? (
                  <ChevronDown className={cn('h-3.5 w-3.5', styles.themeChevron, themeMenuOpen && styles.themeChevronOpen)} />
                ) : null}
              </button>

              {themeMenuOpen ? (
                <div role="menu" aria-label="테마 설정" className={styles.themeMenu}>
                  {themeOptions.map(({ mode, label, Icon }) => {
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
        </CardContent>
      </Card>
    </aside>
  );
});

ProjectSidebar.displayName = 'ProjectSidebar';

interface ViewportPanelProps {
  selectedProject: ProjectSnapshot | null;
  streamStatus: StreamStatus;
  viewer: DashboardState['viewer'];
  errorCode: DashboardErrorCode | null;
  onRotateViewer: (deltaX: number, deltaY: number) => void;
}

const ViewportPanel = memo(function ViewportPanel({
  selectedProject,
  streamStatus,
  viewer,
  errorCode,
  onRotateViewer
}: ViewportPanelProps) {
  const [viewerHelpOpen, setViewerHelpOpen] = useState(false);
  const viewerHelpRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    pointerId: number;
    x: number;
    y: number;
  }>({
    active: false,
    pointerId: -1,
    x: 0,
    y: 0
  });

  useEffect(() => {
    if (!viewerHelpOpen) {
      return;
    }

    const handleOutsidePointer = (event: PointerEvent) => {
      if (!viewerHelpRef.current?.contains(event.target as Node)) {
        setViewerHelpOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setViewerHelpOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [viewerHelpOpen]);

  return (
    <section className={cn('centerArea', styles.centerArea)}>
      <Card className={cn('border-border/70 bg-card/85', styles.heroCard)}>
        <CardHeader className={styles.viewerHeader}>
          <div className={styles.viewerHeaderRow}>
            <CardTitle className={styles.viewerTitle}>{selectedProject?.name ?? '선택된 프로젝트 없음'}</CardTitle>
            <div ref={viewerHelpRef} className={styles.viewerHelpBox}>
              <button
                type="button"
                className={styles.viewerHelpButton}
                aria-label="뷰포트 조작 안내"
                aria-expanded={viewerHelpOpen}
                title="뷰포트 조작 안내"
                onClick={() => setViewerHelpOpen((prev) => !prev)}
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
              {viewerHelpOpen ? (
                <div role="dialog" aria-label="Viewport help" className={styles.viewerHelpDialog}>
                  <p className={styles.viewerHelpTitle}>Viewport Guide</p>
                  <ul className={styles.viewerHelpList}>
                    <li>마우스 드래그로 yaw/pitch를 회전합니다.</li>
                    <li>화살표 키로 미세하게 시점을 이동합니다.</li>
                    <li>우상단 yaw/pitch 값으로 현재 각도를 확인합니다.</li>
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
          <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            스트림 상태: {streamLabel[streamStatus]}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorCode ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errorCopy[errorCode]}
            </div>
          ) : null}

          <div
            className={cn('relative h-[500px] overflow-hidden rounded-xl border border-border/70 p-4 outline-none', styles.viewportShell)}
            tabIndex={0}
            role="application"
            aria-label="Model viewport. Drag or use arrow keys to rotate."
            aria-describedby="dashboard-viewport-assist"
            onPointerDown={(event) => {
              dragRef.current = {
                active: true,
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) return;
              const deltaX = event.clientX - dragRef.current.x;
              const deltaY = event.clientY - dragRef.current.y;
              dragRef.current.x = event.clientX;
              dragRef.current.y = event.clientY;
              onRotateViewer(deltaX, deltaY);
            }}
            onPointerUp={(event) => {
              if (dragRef.current.pointerId !== event.pointerId) return;
              dragRef.current.active = false;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              dragRef.current.active = false;
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                onRotateViewer(-12, 0);
                event.preventDefault();
              } else if (event.key === 'ArrowRight') {
                onRotateViewer(12, 0);
                event.preventDefault();
              } else if (event.key === 'ArrowUp') {
                onRotateViewer(0, -12);
                event.preventDefault();
              } else if (event.key === 'ArrowDown') {
                onRotateViewer(0, 12);
                event.preventDefault();
              }
            }}
          >
            <div
              className={cn(
                'absolute inset-4 flex items-center justify-center rounded-xl border border-accent/40 bg-background/30 text-center text-sm font-semibold text-foreground/90 transition-transform',
                styles.viewportFrame
              )}
              style={{ transform: `rotateX(${viewer.pitchDeg}deg) rotateY(${viewer.yawDeg}deg)` }}
            >
              <ModelPreview
                projectId={selectedProject?.projectId ?? null}
                hasGeometry={Boolean(selectedProject?.hasGeometry)}
              />
            </div>
            <div className="absolute right-3 top-3 rounded-md border border-border/70 bg-background/70 px-2 py-1 font-mono text-xs text-muted-foreground">
              yaw {Math.round(viewer.yawDeg)} / pitch {Math.round(viewer.pitchDeg)}
            </div>
            <div className="absolute bottom-3 left-3 rounded-md border border-border/70 bg-background/70 px-2 py-1 text-xs text-muted-foreground">
              center anchor [{viewer.focusAnchor[0]}, {viewer.focusAnchor[1]}, {viewer.focusAnchor[2]}]
            </div>
            <p id="dashboard-viewport-assist" className="sr-only">
              pointer drag / arrow keys
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
});

ViewportPanel.displayName = 'ViewportPanel';

interface InspectorSidebarProps {
  selectedProject: ProjectSnapshot | null;
  hierarchyRows: readonly HierarchyRow[];
  nodeCount: number;
  activeTab: InspectorTabId;
  onSelectTab: (tabId: InspectorTabId) => void;
}

const InspectorSidebar = memo(function InspectorSidebar({
  selectedProject,
  hierarchyRows,
  nodeCount,
  activeTab,
  onSelectTab
}: InspectorSidebarProps) {
  const [inspectorHelpOpen, setInspectorHelpOpen] = useState(false);
  const inspectorToolsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!inspectorHelpOpen) {
      return;
    }

    const handleOutsidePointer = (event: PointerEvent) => {
      if (!inspectorToolsRef.current?.contains(event.target as Node)) {
        setInspectorHelpOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setInspectorHelpOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [inspectorHelpOpen]);

  return (
    <aside className={cn('inspectorArea', styles.inspectorArea)}>
      <Card className={cn('flex h-full flex-col border-border/75', styles.sidebarCard, styles.rightSidebarCard)}>
        <CardHeader className={styles.inspectorHeader}>
          <div className={styles.inspectorHeaderRow}>
            <CardTitle className="flex items-center gap-2 text-base">
              <Workflow className="h-4 w-4 text-accent" />
              Inspector
            </CardTitle>
            <div ref={inspectorToolsRef} className={styles.inspectorToolBox}>
              <button
                type="button"
                className={styles.inspectorToolButton}
                aria-label="인스펙터 도움말 열기"
                aria-expanded={inspectorHelpOpen}
                title="Hierarchy/Animation 확인 및 단축 안내"
                onClick={() => setInspectorHelpOpen((prev) => !prev)}
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
              {inspectorHelpOpen ? (
                <div role="dialog" aria-label="Inspector help" className={styles.inspectorHelpDialog}>
                  <p className={styles.inspectorHelpTitle}>Inspector Guide</p>
                  <ul className={styles.inspectorHelpList}>
                    <li>Hierarchy 탭에서 bone/cube 구조를 확인하세요.</li>
                    <li>Animation 탭에서 length와 loop 상태를 확인하세요.</li>
                    <li>노드는 hover 시 강조되고, 하단 칩에서 상태 요약을 봅니다.</li>
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className={cn('flex min-h-0 flex-1 flex-col', styles.inspectorContent)}>
          <div className={styles.inspectorContextBar}>
            <span className={styles.inspectorContextRevision}>rev {selectedProject?.revision ?? '-'}</span>
            <div className={styles.inspectorContextStats}>
              <span className={styles.inspectorContextStat}>
                <Bone className="h-3.5 w-3.5" />
                {selectedProject?.stats.bones ?? 0}
              </span>
              <span className={styles.inspectorContextStat}>
                <Cuboid className="h-3.5 w-3.5" />
                {selectedProject?.stats.cubes ?? 0}
              </span>
            </div>
          </div>
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
                      style={{ paddingInlineStart: `${0.48 + depth * 0.72}rem` }}
                    >
                      <div className={styles.hierarchyTreeMain}>
                        {node.kind === 'bone' ? (
                          <Bone className={cn('h-3.5 w-3.5', styles.hierarchyBoneIcon)} />
                        ) : (
                          <Cuboid className={cn('h-3.5 w-3.5', styles.hierarchyCubeIcon)} />
                        )}
                        <span className={styles.hierarchyTreeName}>{node.name}</span>
                      </div>
                      <span className={styles.hierarchyTreeKind}>{node.kind}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">하이어라키 데이터가 없습니다.</p>
              )
            ) : selectedProject && selectedProject.animations.length > 0 ? (
              <div className={styles.animationList}>
                {selectedProject.animations.map((animation) => (
                  <div key={animation.id} className={styles.animationItem}>
                    <p className={styles.animationName}>{animation.name}</p>
                    <p className={styles.animationMeta}>
                      length {animation.length}s · {animation.loop ? 'loop' : 'once'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">애니메이션 데이터가 없습니다.</p>
            )}
          </div>
          <Separator />
          <div className={styles.inspectorFooterMeta}>
            <span className={styles.inspectorFooterItem}>
              <span className={styles.inspectorFooterKey}>Geometry</span>
              <span className={styles.inspectorFooterValue}>{selectedProject?.hasGeometry ? 'on' : 'off'}</span>
            </span>
            <span className={styles.inspectorFooterItem}>
              <span className={styles.inspectorFooterKey}>Nodes</span>
              <span className={styles.inspectorFooterValueMono}>{nodeCount}</span>
            </span>
            <span className={styles.inspectorFooterItem}>
              <span className={styles.inspectorFooterKey}>Animations</span>
              <span className={styles.inspectorFooterValueMono}>{selectedProject?.animations.length ?? 0}</span>
            </span>
          </div>
        </CardContent>
      </Card>
    </aside>
  );
});

InspectorSidebar.displayName = 'InspectorSidebar';

export default function HomePage() {
  const [state, setState] = useState<DashboardState>(() => createInitialDashboardState());
  const [reloadVersion, setReloadVersion] = useState(0);
  const [projectSidebarCollapsed, setProjectSidebarCollapsed] = useState(false);

  useProjectList({ setState, reloadVersion });
  useDashboardStream({ state, setState });
  const { themeMode, setThemeMode } = useThemeMode();

  const retryProjectLoad = useCallback(() => {
    setReloadVersion((prev) => prev + 1);
  }, []);
  const toggleProjectSidebar = useCallback(() => {
    setProjectSidebarCollapsed((prev) => !prev);
  }, []);
  const handleProjectSelect = useCallback((projectId: string) => {
    setState((prev) => selectProject(prev, projectId));
  }, []);
  const handleInspectorTabSelect = useCallback((tabId: InspectorTabId) => {
    setState((prev) => setActiveTab(prev, tabId));
  }, []);
  const handleViewerRotate = useCallback((deltaX: number, deltaY: number) => {
    setState((prev) => ({
      ...prev,
      viewer: rotateViewer(prev.viewer, deltaX, deltaY)
    }));
  }, []);
  const handleThemeModeChange = useCallback((mode: ThemeMode) => {
    setThemeMode(mode);
  }, [setThemeMode]);

  const selectedProject = useMemo(() => {
    if (state.selectedProjectId === null) {
      return null;
    }
    return state.projects.find((project) => project.projectId === state.selectedProjectId) ?? null;
  }, [state.projects, state.selectedProjectId]);
  const nodeCount = selectedProject ? selectedProject.stats.bones + selectedProject.stats.cubes : 0;
  const hierarchyRows = useMemo(
    () => (selectedProject && state.activeTab === 'hierarchy' ? flattenHierarchyRows(selectedProject.hierarchy) : []),
    [selectedProject, state.activeTab]
  );

  if (state.status === 'loading' && state.projects.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4">
        <Card className="w-full border-border/60 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <img
                alt="Ashfox"
                src={ashfoxLogo}
                width={32}
                height={32}
                className="h-8 w-8 rounded-sm border border-border/70 bg-background/80 object-contain"
              />
              <span>Ashfox Dashboard</span>
              <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
            </CardTitle>
            <CardDescription>프로젝트 목록을 불러오는 중입니다.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  if (state.status === 'error' && state.projects.length === 0) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4">
        <Card className="w-full border-destructive/40 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <img
                alt="Ashfox"
                src={ashfoxLogo}
                width={32}
                height={32}
                className="h-8 w-8 rounded-sm border border-border/70 bg-background/80 object-contain"
              />
              <span>Ashfox Dashboard</span>
            </CardTitle>
            <CardDescription className="text-destructive">{errorCopy.project_load_failed}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={retryProjectLoad}>다시 시도</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (state.status === 'empty') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4">
        <Card className="w-full border-border/60 bg-card/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-2xl">
              <img
                alt="Ashfox"
                src={ashfoxLogo}
                width={32}
                height={32}
                className="h-8 w-8 rounded-sm border border-border/70 bg-background/80 object-contain"
              />
              <span>Ashfox Dashboard</span>
            </CardTitle>
            <CardDescription>표시할 프로젝트가 없습니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={retryProjectLoad} variant="secondary">
              프로젝트 다시 불러오기
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className={cn('layout', styles.shell)}>
      <div className={cn('layout', styles.layout, projectSidebarCollapsed ? styles.layoutCollapsed : undefined)}>
        <ProjectSidebar
          projects={state.projects}
          selectedProjectId={state.selectedProjectId}
          streamStatus={state.streamStatus}
          collapsed={projectSidebarCollapsed}
          onToggleCollapsed={toggleProjectSidebar}
          onRetryProjectLoad={retryProjectLoad}
          onSelectProject={handleProjectSelect}
          themeMode={themeMode}
          onThemeModeChange={handleThemeModeChange}
        />
        <ViewportPanel
          selectedProject={selectedProject}
          streamStatus={state.streamStatus}
          viewer={state.viewer}
          errorCode={state.errorCode}
          onRotateViewer={handleViewerRotate}
        />
        <InspectorSidebar
          selectedProject={selectedProject}
          hierarchyRows={hierarchyRows}
          nodeCount={nodeCount}
          activeTab={state.activeTab}
          onSelectTab={handleInspectorTabSelect}
        />
      </div>
    </main>
  );
}
