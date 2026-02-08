import { ToolError } from '../../types/internal';
import {
  AnimationCommand,
  DeleteAnimationCommand,
  KeyframeCommand,
  TriggerKeyframeCommand,
  UpdateAnimationCommand
} from '../../ports/editor';
import { errorMessage, Logger } from '../../logging';
import type { PreviewItem } from '../../types/blockbench';
import {
  runCreateAnimation,
  runDeleteAnimation,
  runSetKeyframes,
  runSetTriggerKeyframes,
  runUpdateAnimation
} from './animation/animationCommands';
import { readGlobals } from './blockbenchUtils';

export class BlockbenchAnimationAdapter {
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  createAnimation(params: AnimationCommand): ToolError | null {
    return this.withViewportRefresh(runCreateAnimation(this.log, params), 'create_animation');
  }

  updateAnimation(params: UpdateAnimationCommand): ToolError | null {
    return this.withViewportRefresh(runUpdateAnimation(this.log, params), 'update_animation');
  }

  deleteAnimation(params: DeleteAnimationCommand): ToolError | null {
    return this.withViewportRefresh(runDeleteAnimation(this.log, params), 'delete_animation');
  }

  setKeyframes(params: KeyframeCommand): ToolError | null {
    return runSetKeyframes(this.log, params);
  }

  setTriggerKeyframes(params: TriggerKeyframeCommand): ToolError | null {
    return runSetTriggerKeyframes(this.log, params);
  }

  private withViewportRefresh(result: ToolError | null, source: string): ToolError | null {
    if (result) return result;
    this.refreshViewport(source);
    return null;
  }

  private refreshViewport(source: string): void {
    try {
      const globals = readGlobals();
      const registry = globals.Preview;
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
      if (rendered.size === 0) {
        globals.Blockbench?.dispatchEvent?.('ashfox:viewport_changed', { source });
      }
    } catch (err) {
      this.log.warn('animation viewport refresh failed', {
        message: errorMessage(err, 'animation viewport refresh failed'),
        source
      });
    }
  }
}



