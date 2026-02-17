'use client';

import { useRef } from 'react';

import type { ViewerState } from '../../lib/dashboardModel';
import styles from './DashboardViewport.module.css';

interface DashboardViewportProps {
  viewer: ViewerState;
  hasGeometry: boolean;
  onRotate: (deltaX: number, deltaY: number) => void;
}

const VIEWPORT_ASSIST_ID = 'dashboard-viewport-assist';
const KEYBOARD_ROTATION_DELTA = 12;

export const DashboardViewport = ({ viewer, hasGeometry, onRotate }: DashboardViewportProps) => {
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
    <div
      className={styles.viewport}
      tabIndex={0}
      aria-label="Model viewport. Drag or use arrow keys to rotate."
      aria-describedby={VIEWPORT_ASSIST_ID}
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
        if (!dragRef.current.active || dragRef.current.pointerId !== event.pointerId) {
          return;
        }
        const deltaX = event.clientX - dragRef.current.x;
        const deltaY = event.clientY - dragRef.current.y;
        dragRef.current = {
          ...dragRef.current,
          x: event.clientX,
          y: event.clientY
        };
        onRotate(deltaX, deltaY);
      }}
      onPointerUp={(event) => {
        if (dragRef.current.pointerId === event.pointerId) {
          dragRef.current.active = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        dragRef.current.active = false;
      }}
      onKeyDown={(event) => {
        switch (event.key) {
          case 'ArrowLeft':
            onRotate(-KEYBOARD_ROTATION_DELTA, 0);
            event.preventDefault();
            break;
          case 'ArrowRight':
            onRotate(KEYBOARD_ROTATION_DELTA, 0);
            event.preventDefault();
            break;
          case 'ArrowUp':
            onRotate(0, -KEYBOARD_ROTATION_DELTA);
            event.preventDefault();
            break;
          case 'ArrowDown':
            onRotate(0, KEYBOARD_ROTATION_DELTA);
            event.preventDefault();
            break;
          default:
            break;
        }
      }}
    >
      <div
        className={styles.frame}
        style={{ transform: `rotateX(${viewer.pitchDeg}deg) rotateY(${viewer.yawDeg}deg)` }}
      >
        {hasGeometry ? 'Model viewport (drag to rotate)' : 'No geometry'}
      </div>

      {!hasGeometry ? (
        <div className={styles.emptyBadge} role="status" aria-live="polite">
          empty: anchor normalized to [0,0,0]
        </div>
      ) : null}

      <div
        aria-hidden="true"
        data-anchor-x={viewer.focusAnchor[0]}
        data-anchor-y={viewer.focusAnchor[1]}
        data-anchor-z={viewer.focusAnchor[2]}
        className={styles.anchorDot}
      />

      <div className={styles.anchorLabel}>
        center anchor [{viewer.focusAnchor[0]}, {viewer.focusAnchor[1]}, {viewer.focusAnchor[2]}]
      </div>
      <p id={VIEWPORT_ASSIST_ID} className={styles.assist}>
        pointer drag / arrow keys
      </p>
    </div>
  );
};
