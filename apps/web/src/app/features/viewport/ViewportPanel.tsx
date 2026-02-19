import { Bone, Clapperboard, Cuboid, MousePointer2, Play, Repeat, Square } from 'lucide-react';
import { memo, useRef } from 'react';

import type {
  AnimationSummary,
  DashboardErrorCode,
  ProjectSnapshot,
  ProjectTextureAtlas,
  StreamStatus,
  ViewerState
} from '../../../lib/dashboardModel';
import { cn } from '../../../lib/utils';
import { ModelPreview } from '../../_components/ModelPreview';
import styles from '../../page.module.css';
import { errorCopy, streamLabel } from '../shared/dashboardCopy';

export type RotateSource = 'pointer' | 'keyboard';
export type AnimationPlaybackMode = 'stopped' | 'playing';

interface ViewportPanelProps {
  selectedProject: ProjectSnapshot | null;
  streamStatus: StreamStatus;
  viewer: ViewerState;
  errorCode: DashboardErrorCode | null;
  selectedTexture: ProjectTextureAtlas | null;
  selectedAnimation: AnimationSummary | null;
  animationPlaybackMode: AnimationPlaybackMode;
  animationLoopEnabled: boolean;
  invertPointer: boolean;
  onToggleInvertPointer: () => void;
  onRotateViewer: (deltaX: number, deltaY: number, source: RotateSource) => void;
  onPlayAnimation: () => void;
  onStopAnimation: () => void;
  onToggleAnimationLoop: () => void;
}

export const ViewportPanel = memo(function ViewportPanel({
  selectedProject,
  streamStatus,
  viewer,
  errorCode,
  selectedTexture,
  selectedAnimation,
  animationPlaybackMode,
  animationLoopEnabled,
  invertPointer,
  onToggleInvertPointer,
  onRotateViewer,
  onPlayAnimation,
  onStopAnimation,
  onToggleAnimationLoop
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

  return (
    <section className={cn('centerArea', styles.centerArea)}>
      <div className={styles.viewportPanel}>
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          스트림 상태: {streamLabel[streamStatus]}
        </p>
        {errorCode ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorCopy[errorCode]}
          </div>
        ) : null}

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
            hasGeometry={Boolean(selectedProject?.hasGeometry)}
            yawDeg={viewer.yawDeg}
            pitchDeg={viewer.pitchDeg}
            selectedAnimationId={selectedAnimation?.id ?? null}
            selectedAnimationName={selectedAnimation?.name ?? null}
            animationPlaying={animationPlaybackMode === 'playing'}
            animationLoopEnabled={animationLoopEnabled}
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
          {selectedAnimation ? (
            <div
              data-overlay="animation"
              className={styles.viewportAnimationOverlay}
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
              <div className={styles.viewportAnimationInfo}>
                <Clapperboard className="h-3.5 w-3.5" />
                <span className={styles.viewportAnimationName}>{selectedAnimation.name}</span>
              </div>
              <div className={styles.viewportAnimationControls}>
                <button
                  type="button"
                  className={cn(
                    styles.viewportAnimationButton,
                    animationPlaybackMode === 'playing' && styles.viewportAnimationButtonActive
                  )}
                  onClick={onPlayAnimation}
                  aria-label="애니메이션 재생"
                  title="재생"
                >
                  <Play className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className={cn(styles.viewportAnimationButton, animationLoopEnabled && styles.viewportAnimationButtonActive)}
                  onClick={onToggleAnimationLoop}
                  aria-pressed={animationLoopEnabled}
                  aria-label="무한 재생 토글"
                  title="무한 재생"
                >
                  <Repeat className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className={styles.viewportAnimationButton}
                  onClick={onStopAnimation}
                  aria-label="애니메이션 정지"
                  title="정지"
                >
                  <Square className="h-3.5 w-3.5" />
                </button>
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
