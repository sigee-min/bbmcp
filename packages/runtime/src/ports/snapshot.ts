import { SessionState } from '../session';

export interface SnapshotPort {
  readSnapshot: () => SessionState | null;
}


