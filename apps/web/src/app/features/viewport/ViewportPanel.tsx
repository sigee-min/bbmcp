import { Bone, Check, ChevronDown, Clapperboard, Cuboid, LandPlot, MousePointer2 } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';

import type {
  DashboardErrorCode,
  ProjectSnapshot,
  ProjectTextureAtlas,
  StreamStatus,
  ViewerState
} from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import { AdaptiveMenu } from '../../_components/AdaptiveMenu';
import { useDismissibleMenu } from '../../_hooks/useDismissibleMenu';
import { ModelPreview } from '../../_components/ModelPreview';
import {
  findViewportEnvironmentTemplate,
  VIEWPORT_ENVIRONMENT_TEMPLATES,
  type ViewportEnvironmentTemplateId
} from './viewportEnvironmentTemplates';
import styles from '../../page.module.css';
import { errorCopy, streamLabel } from '../shared/dashboardCopy';
import { ErrorNotice } from '../shared/ErrorNotice';

export type RotateSource = 'pointer' | 'keyboard';

interface ViewportPanelProps {
  selectedProject: ProjectSnapshot | null;
  workspaceId: string;
  streamStatus: StreamStatus;
  viewer: ViewerState;
  errorCode: DashboardErrorCode | null;
  animationErrorMessage: string | null;
  selectedTexture: ProjectTextureAtlas | null;
  selectedAnimationId: string | null;
  selectedAnimationName: string | null;
  animationPlaying: boolean;
  invertPointer: boolean;
  environmentTemplateId: ViewportEnvironmentTemplateId;
  onToggleInvertPointer: () => void;
  onSelectEnvironmentTemplate: (templateId: ViewportEnvironmentTemplateId) => void;
  onRotateViewer: (deltaX: number, deltaY: number, source: RotateSource) => void;
  onAnimationPlaybackNoticeChange: (notice: string | null) => void;
}

export const ViewportPanel = memo(function ViewportPanel({
  selectedProject,
  workspaceId,
  streamStatus,
  viewer,
  errorCode,
  animationErrorMessage,
  selectedTexture,
  selectedAnimationId,
  selectedAnimationName,
  animationPlaying,
  invertPointer,
  environmentTemplateId,
  onToggleInvertPointer,
  onSelectEnvironmentTemplate,
  onRotateViewer,
  onAnimationPlaybackNoticeChange
}: ViewportPanelProps) {
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
  const [environmentMenuOpen, setEnvironmentMenuOpen] = useState(false);
  const environmentMenuRef = useRef<HTMLDivElement | null>(null);
  const environmentMenuTriggerRef = useRef<HTMLButtonElement | null>(null);

  const selectedEnvironment = useMemo(
    () => findViewportEnvironmentTemplate(environmentTemplateId),
    [environmentTemplateId]
  );

  const closeEnvironmentMenu = useCallback(() => {
    setEnvironmentMenuOpen(false);
  }, []);
  const toggleEnvironmentMenu = useCallback(() => {
    setEnvironmentMenuOpen((prev) => !prev);
  }, []);
  const containsEnvironmentMenuTarget = useCallback(
    (target: EventTarget | null) => target instanceof Node && Boolean(environmentMenuRef.current?.contains(target)),
    []
  );

  useDismissibleMenu({
    open: environmentMenuOpen,
    containsTarget: containsEnvironmentMenuTarget,
    onDismiss: closeEnvironmentMenu
  });

  return (
    <section className={cn('centerArea', styles.centerArea)}>
      <div className={styles.viewportPanel}>
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          스트림 상태: {streamLabel[streamStatus]}
        </p>
        <ErrorNotice
          message={errorCode ? errorCopy[errorCode] : null}
          channel="panel"
          size="sm"
          className="mb-2"
        />
        <ErrorNotice message={animationErrorMessage} channel="panel" size="sm" className="mb-2" />

        <div
          className={cn('relative outline-none', styles.viewportShell)}
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
            onRotateViewer(deltaX, deltaY, 'pointer');
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
              onRotateViewer(-12, 0, 'keyboard');
              event.preventDefault();
            } else if (event.key === 'ArrowRight') {
              onRotateViewer(12, 0, 'keyboard');
              event.preventDefault();
            } else if (event.key === 'ArrowUp') {
              onRotateViewer(0, -12, 'keyboard');
              event.preventDefault();
            } else if (event.key === 'ArrowDown') {
              onRotateViewer(0, 12, 'keyboard');
              event.preventDefault();
            }
          }}
        >
          <ModelPreview
            projectId={selectedProject?.projectId ?? null}
            workspaceId={workspaceId}
            hasGeometry={Boolean(selectedProject?.hasGeometry)}
            yawDeg={viewer.yawDeg}
            pitchDeg={viewer.pitchDeg}
            selectedAnimationId={selectedAnimationId}
            selectedAnimationName={selectedAnimationName}
            animationPlaying={animationPlaying}
            environmentTemplateId={environmentTemplateId}
            onAnimationPlaybackNoticeChange={onAnimationPlaybackNoticeChange}
            className={styles.viewportCanvas}
          />
          <div className={styles.viewportTopLeft}>
            <div className={styles.viewportMetaBar}>
              <span className={styles.viewportMetaRevision}>rev {selectedProject?.revision ?? '-'}</span>
              <span className={styles.viewportMetaStat}>
                <Bone className="h-3.5 w-3.5" />
                {selectedProject?.stats.bones ?? 0}
              </span>
              <span className={styles.viewportMetaStat}>
                <Cuboid className="h-3.5 w-3.5" />
                {selectedProject?.stats.cubes ?? 0}
              </span>
              <span className={styles.viewportMetaStat}>
                <Clapperboard className="h-3.5 w-3.5" />
                {selectedProject?.animations.length ?? 0}
              </span>
            </div>
          </div>
          <div className={styles.viewportTopRight}>
            <div
              ref={environmentMenuRef}
              className={styles.viewportEnvironmentWrap}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
            >
              <button
                ref={environmentMenuTriggerRef}
                type="button"
                className={styles.viewportEnvironmentTrigger}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={toggleEnvironmentMenu}
                aria-label="뷰포트 배경 템플릿 선택"
                aria-haspopup="menu"
                aria-expanded={environmentMenuOpen}
                title="뷰포트 배경 선택"
              >
                <LandPlot className="h-3.5 w-3.5" />
                <span className={styles.viewportEnvironmentTriggerLabel}>{selectedEnvironment.label}</span>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5',
                    styles.viewportEnvironmentTriggerChevron,
                    environmentMenuOpen && styles.viewportEnvironmentTriggerChevronOpen
                  )}
                />
              </button>
              <AdaptiveMenu
                open={environmentMenuOpen}
                anchorRef={environmentMenuTriggerRef}
                ariaLabel="뷰포트 배경 템플릿 목록"
                className={styles.viewportEnvironmentMenu}
              >
                {VIEWPORT_ENVIRONMENT_TEMPLATES.map((template) => {
                  const isActive = template.id === environmentTemplateId;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      className={cn(styles.viewportEnvironmentMenuItem, isActive && styles.viewportEnvironmentMenuItemActive)}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                      onClick={() => {
                        onSelectEnvironmentTemplate(template.id);
                        closeEnvironmentMenu();
                      }}
                    >
                      <span className={styles.viewportEnvironmentMenuItemLabel}>{template.label}</span>
                      <span className={styles.viewportEnvironmentMenuItemDescription}>{template.description}</span>
                      {isActive ? <Check className={styles.viewportEnvironmentMenuItemCheck} /> : null}
                    </button>
                  );
                })}
              </AdaptiveMenu>
            </div>
            <div className={cn('font-mono', styles.viewportHud)}>
              yaw {Math.round(viewer.yawDeg)} / pitch {Math.round(viewer.pitchDeg)}
            </div>
            <div className={styles.viewportInvertWrap}>
              <button
                type="button"
                className={cn(styles.viewportInvertButton, invertPointer && styles.viewportInvertButtonActive)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={onToggleInvertPointer}
                title="마우스 반전"
                aria-pressed={invertPointer}
                aria-label="마우스 반전 토글"
              >
                <MousePointer2 className="h-3.5 w-3.5" />
              </button>
              <div role="tooltip" className={styles.viewportInvertTooltip}>
                마우스 반전 {invertPointer ? '켜짐' : '꺼짐'}
              </div>
            </div>
          </div>
          {selectedTexture ? (
            <div
              data-overlay="texture"
              className={styles.viewportTextureOverlay}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onPointerMove={(event) => {
                event.stopPropagation();
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
              }}
            >
              <div className={styles.viewportTextureOverlayBody}>
                {selectedTexture.imageDataUrl ? (
                  <img
                    src={selectedTexture.imageDataUrl}
                    alt={`${selectedTexture.name} texture`}
                    className={styles.viewportTextureImage}
                    loading="lazy"
                    draggable={false}
                  />
                ) : null}
                <svg
                  className={styles.viewportTextureUv}
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                  aria-label={`${selectedTexture.name} UV map`}
                  role="img"
                >
                  {selectedTexture.uvEdges.map((edge, index) => (
                    <line
                      key={`${selectedTexture.textureId}-${index}`}
                      x1={edge.x1}
                      y1={1 - edge.y1}
                      x2={edge.x2}
                      y2={1 - edge.y2}
                    />
                  ))}
                </svg>
              </div>
            </div>
          ) : null}
          <p id="dashboard-viewport-assist" className="sr-only">
            pointer drag / arrow keys
          </p>
        </div>
      </div>
    </section>
  );
});

ViewportPanel.displayName = 'ViewportPanel';
