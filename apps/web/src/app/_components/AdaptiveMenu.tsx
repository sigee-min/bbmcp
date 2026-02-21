'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

type MenuPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

type PlacementCandidate = {
  placement: MenuPlacement;
  top: number;
  left: number;
};

export interface AdaptiveMenuProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  className?: string;
  role?: string;
  ariaLabel: string;
  matchAnchorWidth?: boolean;
  children: ReactNode;
}

const VIEWPORT_MARGIN_PX = 8;
const MENU_GAP_PX = 6;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const scoreViewportOverflow = (candidate: PlacementCandidate, width: number, height: number, viewportWidth: number, viewportHeight: number): number => {
  const overflowLeft = Math.max(0, VIEWPORT_MARGIN_PX - candidate.left);
  const overflowRight = Math.max(0, candidate.left + width - (viewportWidth - VIEWPORT_MARGIN_PX));
  const overflowTop = Math.max(0, VIEWPORT_MARGIN_PX - candidate.top);
  const overflowBottom = Math.max(0, candidate.top + height - (viewportHeight - VIEWPORT_MARGIN_PX));
  return overflowLeft + overflowRight + overflowTop + overflowBottom;
};

export function AdaptiveMenu({
  open,
  anchorRef,
  className,
  role = 'menu',
  ariaLabel,
  matchAnchorWidth = false,
  children
}: AdaptiveMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed',
    top: 0,
    left: 0,
    right: 'auto',
    bottom: 'auto',
    visibility: 'hidden'
  });

  const updatePlacement = useCallback(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) {
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const measuredRect = menu.getBoundingClientRect();
    const menuWidth = matchAnchorWidth ? Math.max(anchorRect.width, 1) : Math.max(measuredRect.width, 1);
    const menuHeight = Math.max(measuredRect.height, 1);

    const candidates: PlacementCandidate[] = [
      {
        placement: 'bottom-start',
        top: anchorRect.bottom + MENU_GAP_PX,
        left: anchorRect.left
      },
      {
        placement: 'bottom-end',
        top: anchorRect.bottom + MENU_GAP_PX,
        left: anchorRect.right - menuWidth
      },
      {
        placement: 'top-start',
        top: anchorRect.top - MENU_GAP_PX - menuHeight,
        left: anchorRect.left
      },
      {
        placement: 'top-end',
        top: anchorRect.top - MENU_GAP_PX - menuHeight,
        left: anchorRect.right - menuWidth
      }
    ];

    let best = candidates[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const score = scoreViewportOverflow(candidate, menuWidth, menuHeight, viewportWidth, viewportHeight);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    const maxLeft = Math.max(VIEWPORT_MARGIN_PX, viewportWidth - menuWidth - VIEWPORT_MARGIN_PX);
    const maxTop = Math.max(VIEWPORT_MARGIN_PX, viewportHeight - menuHeight - VIEWPORT_MARGIN_PX);
    const nextLeft = clamp(best.left, VIEWPORT_MARGIN_PX, maxLeft);
    const nextTop = clamp(best.top, VIEWPORT_MARGIN_PX, maxTop);

    setStyle({
      position: 'fixed',
      top: `${nextTop}px`,
      left: `${nextLeft}px`,
      right: 'auto',
      bottom: 'auto',
      width: matchAnchorWidth ? `${Math.max(anchorRect.width, 1)}px` : undefined,
      visibility: 'visible'
    });
  }, [anchorRef, matchAnchorWidth]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    updatePlacement();
  }, [open, updatePlacement]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleLayoutChange = () => {
      updatePlacement();
    };

    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener('scroll', handleLayoutChange, true);
    return () => {
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener('scroll', handleLayoutChange, true);
    };
  }, [open, updatePlacement]);

  if (!open) {
    return null;
  }

  return (
    <div ref={menuRef} role={role} aria-label={ariaLabel} className={className} style={style}>
      {children}
    </div>
  );
}

