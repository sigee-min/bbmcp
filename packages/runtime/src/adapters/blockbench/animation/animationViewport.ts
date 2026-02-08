import type { Logger } from '../../../logging';
import { errorMessage } from '../../../logging';
import type { AnimationClip, PreviewItem } from '../../../types/blockbench';
import { readGlobals } from '../blockbenchUtils';

export const refreshAnimationViewport = (log: Logger, clip: AnimationClip | null, time?: number) => {
  if (!clip) return;
  const globals = readGlobals();
  try {
    if (typeof clip.select === 'function') {
      clip.select();
    } else if (globals.Animation?.selected) {
      globals.Animation.selected = clip;
    }
    if (Number.isFinite(Number(time))) {
      const resolvedTime = Number(time);
      if (typeof clip.setTime === 'function') {
        clip.setTime(resolvedTime);
      } else if (typeof globals.Animator?.setTime === 'function') {
        globals.Animator.setTime(resolvedTime);
      } else if (typeof globals.Animator?.preview === 'function') {
        globals.Animator.preview(resolvedTime);
      } else if (typeof clip.time === 'number') {
        clip.time = resolvedTime;
      }
    }
    renderViewportPreview(globals.Preview);
  } catch (err) {
    log.warn('animation viewport refresh failed', { message: errorMessage(err, 'viewport refresh failed') });
  }
};

const renderViewportPreview = (registry: ReturnType<typeof readGlobals>['Preview']): void => {
  const selected = registry?.selected;
  const all = registry?.all ?? [];
  const candidates = [selected, ...all].filter((entry): entry is PreviewItem => Boolean(entry));
  const rendered = new Set<PreviewItem>();
  for (const preview of candidates) {
    if (rendered.has(preview)) continue;
    if (typeof preview.render === 'function') {
      preview.render();
      rendered.add(preview);
    }
  }
};
