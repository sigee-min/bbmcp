export type NativeJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface NativeProjectSnapshot {
  projectId: string;
  name: string;
  revision: number;
  hasGeometry: boolean;
  focusAnchor?: readonly [number, number, number];
  hierarchy: Array<{
    id: string;
    name: string;
    kind: 'bone' | 'cube';
    children: Array<{
      id: string;
      name: string;
      kind: 'bone' | 'cube';
      children: never[];
    }>;
  }>;
  animations: Array<{
    id: string;
    name: string;
    length: number;
    loop: boolean;
  }>;
  stats: {
    bones: number;
    cubes: number;
  };
  activeJob?: {
    id: string;
    status: NativeJobStatus;
  };
}

export interface NativeJob {
  id: string;
  projectId: string;
  kind: string;
  status: NativeJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  workerId?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface NativeProjectEvent {
  seq: number;
  event: 'project_snapshot';
  data: NativeProjectSnapshot;
}

export type NativeJobSubmitInput = {
  projectId: string;
  kind: string;
  payload?: Record<string, unknown>;
};
