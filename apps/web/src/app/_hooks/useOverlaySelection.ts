import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AnimationSummary, ProjectTextureAtlas } from '../../lib/dashboardModel';

interface UseOverlaySelectionOptions {
  selectedProjectId: string | null;
  projectTextures: readonly ProjectTextureAtlas[];
  projectAnimations: readonly AnimationSummary[];
  textureOverlayAnchorSelector: string;
}

export function useOverlaySelection({
  selectedProjectId,
  projectTextures,
  projectAnimations,
  textureOverlayAnchorSelector
}: UseOverlaySelectionOptions) {
  const [selectedTextureId, setSelectedTextureId] = useState<string | null>(null);
  const [isTextureOverlayOpen, setIsTextureOverlayOpen] = useState(false);
  const [selectedAnimationId, setSelectedAnimationId] = useState<string | null>(null);

  const closeTextureOverlay = useCallback(() => {
    setIsTextureOverlayOpen(false);
  }, []);

  const handleTextureSelect = useCallback((textureId: string) => {
    setSelectedTextureId(textureId);
    setIsTextureOverlayOpen(true);
  }, []);

  const handleAnimationSelect = useCallback((animationId: string) => {
    setSelectedAnimationId((prev) => (prev === animationId ? prev : animationId));
  }, []);

  useEffect(() => {
    setSelectedTextureId(null);
    setIsTextureOverlayOpen(false);
    setSelectedAnimationId(null);
  }, [selectedProjectId]);

  useEffect(() => {
    setSelectedTextureId((prev) => {
      if (prev && projectTextures.some((texture) => texture.textureId === prev)) {
        return prev;
      }
      return projectTextures[0]?.textureId ?? null;
    });
  }, [projectTextures]);

  useEffect(() => {
    if (projectTextures.length === 0) {
      setIsTextureOverlayOpen(false);
    }
  }, [projectTextures.length]);

  useEffect(() => {
    if (!selectedAnimationId) {
      return;
    }
    const stillExists = projectAnimations.some((animation) => animation.id === selectedAnimationId);
    if (!stillExists) {
      setSelectedAnimationId(null);
    }
  }, [projectAnimations, selectedAnimationId]);

  useEffect(() => {
    const isInsideOverlayAnchor = (target: EventTarget | null, selector: string): boolean =>
      target instanceof Element && Boolean(target.closest(selector));

    const dismissTextureOverlay = (target: EventTarget | null) => {
      if (isTextureOverlayOpen && !isInsideOverlayAnchor(target, textureOverlayAnchorSelector)) {
        closeTextureOverlay();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      dismissTextureOverlay(event.target);
    };

    const handleFocusIn = (event: FocusEvent) => {
      dismissTextureOverlay(event.target);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isTextureOverlayOpen) {
        closeTextureOverlay();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeTextureOverlay, isTextureOverlayOpen, textureOverlayAnchorSelector]);

  const selectedTexture = useMemo(() => {
    if (projectTextures.length === 0) {
      return null;
    }
    if (selectedTextureId) {
      const matched = projectTextures.find((texture) => texture.textureId === selectedTextureId);
      if (matched) {
        return matched;
      }
    }
    return projectTextures[0] ?? null;
  }, [projectTextures, selectedTextureId]);

  const selectedAnimation = useMemo(() => {
    if (!selectedAnimationId) {
      return null;
    }
    return projectAnimations.find((animation) => animation.id === selectedAnimationId) ?? null;
  }, [projectAnimations, selectedAnimationId]);

  const textureOverlayTexture = isTextureOverlayOpen ? selectedTexture : null;
  const animationPlaying = selectedAnimation !== null;

  return {
    selectedTexture,
    selectedTextureId,
    textureOverlayTexture,
    selectedAnimation,
    selectedAnimationId,
    animationPlaying,
    handleTextureSelect,
    handleAnimationSelect,
    closeTextureOverlay
  };
}
