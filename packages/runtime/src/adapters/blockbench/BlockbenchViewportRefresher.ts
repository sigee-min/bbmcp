import { errorMessage, type Logger } from '../../logging';
import type { ViewportRefresherPort, ViewportRefreshRequest } from '../../ports/viewportRefresher';
import { readGlobals } from './blockbenchUtils';
import { reevaluateAnimation } from './viewport/animationRefresh';
import { invalidateCanvas } from './viewport/canvasRefresh';
import { renderViewportPreviews } from './viewport/previewRefresh';

export class BlockbenchViewportRefresher implements ViewportRefresherPort {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  refresh(request: ViewportRefreshRequest): void {
    try {
      const globals = readGlobals();
      if (request.effect === 'animation') {
        reevaluateAnimation(globals);
      }
      const invalidated = invalidateCanvas(globals.Canvas, request.effect);
      const rendered = renderViewportPreviews(globals);
      if (!invalidated && rendered === 0) {
        globals.Blockbench?.dispatchEvent?.('ashfox:viewport_changed', request);
      }
    } catch (err) {
      this.log.warn('viewport refresh failed', {
        source: request.source,
        effect: request.effect,
        message: errorMessage(err, 'viewport refresh failed')
      });
    }
  }
}

