import type { ToolName } from '@ashfox/contracts/types/internal';
import type { ViewportEffect } from '../shared/tooling/viewportEffects';

export type ViewportRefreshRequest = {
  effect: ViewportEffect;
  source: ToolName;
};

export interface ViewportRefresherPort {
  refresh(request: ViewportRefreshRequest): void;
}

export const NOOP_VIEWPORT_REFRESHER: ViewportRefresherPort = {
  refresh: () => undefined
};
