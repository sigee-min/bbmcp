'use client';

import type { CSSProperties } from 'react';
import { useRef } from 'react';

import type { ViewerState } from '../../lib/dashboardModel';

interface DashboardViewportProps {
  viewer: ViewerState;
  hasGeometry: boolean;
  onRotate: (deltaX: number, deltaY: number) => void;
}

const VIEWPORT_FRAME_SIZE = 290;

const viewportStyle: CSSProperties = {
  flex: 1,
  minHeight: 500,
  border: '1px solid #334155',
  borderRadius: 14,
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(2, 6, 23, 0.9) 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  overflow: 'hidden'
};

const frameStyle: CSSProperties = {
  width: VIEWPORT_FRAME_SIZE,
  height: VIEWPORT_FRAME_SIZE,
  borderRadius: 14,
  border: '1px solid rgba(148, 163, 184, 0.35)',
  background: 'radial-gradient(circle at 50% 45%, rgba(59, 130, 246, 0.45), rgba(15, 23, 42, 0.82))',
  transformStyle: 'preserve-3d',
  boxShadow: '0 24px 40px rgba(0, 0, 0, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  color: '#f8fafc'
};

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
      style={viewportStyle}
    >
      <div
        style={{
          ...frameStyle,
          transform: `rotateX(${viewer.pitchDeg}deg) rotateY(${viewer.yawDeg}deg)`
        }}
      >
        {hasGeometry ? 'Model viewport (drag to rotate)' : 'No geometry'}
      </div>

      {!hasGeometry ? (
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: 14,
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '6px 8px',
            fontSize: 12,
            color: '#94a3b8',
            background: 'rgba(15, 23, 42, 0.9)'
          }}
        >
          empty: anchor normalized to [0,0,0]
        </div>
      ) : null}

      <div
        aria-hidden="true"
        data-anchor-x={viewer.focusAnchor[0]}
        data-anchor-y={viewer.focusAnchor[1]}
        data-anchor-z={viewer.focusAnchor[2]}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 8,
          height: 8,
          transform: 'translate(-50%, -50%)',
          borderRadius: 999,
          border: '1px solid #bfdbfe',
          background: 'rgba(59, 130, 246, 0.45)',
          boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.2)'
        }}
      />

      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 12,
          background: 'rgba(15, 23, 42, 0.92)'
        }}
      >
        center anchor [{viewer.focusAnchor[0]}, {viewer.focusAnchor[1]}, {viewer.focusAnchor[2]}]
      </div>
    </div>
  );
};
