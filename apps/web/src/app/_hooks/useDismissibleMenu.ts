'use client';

import { useEffect } from 'react';

interface UseDismissibleMenuOptions {
  open: boolean;
  containsTarget: (target: EventTarget | null) => boolean;
  onDismiss: () => void;
}

export const useDismissibleMenu = ({ open, containsTarget, onDismiss }: UseDismissibleMenuOptions): void => {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleOutsidePointer = (event: PointerEvent) => {
      if (containsTarget(event.target)) {
        return;
      }
      onDismiss();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [containsTarget, onDismiss, open]);
};
