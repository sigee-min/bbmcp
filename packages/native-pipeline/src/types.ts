export * from './nativeJobContracts';

import type { NativeJobPayloadMap, NativeJobResultMap, NativeJobStatus, SupportedNativeJobKind } from './nativeJobContracts';

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

export type NativeJob = {
  id: string;
  projectId: string;
  status: NativeJobStatus;
  attemptCount: number;
  maxAttempts: number;
  leaseMs: number;
  createdAt: string;
  startedAt?: string;
  leaseExpiresAt?: string;
  nextRetryAt?: string;
  completedAt?: string;
  workerId?: string;
  error?: string;
  deadLetter?: boolean;
} & {
  [TKind in SupportedNativeJobKind]: {
    kind: TKind;
    payload?: NativeJobPayloadMap[TKind];
    result?: NativeJobResultMap[TKind];
  }
}[SupportedNativeJobKind];

export interface NativeProjectEvent {
  seq: number;
  event: 'project_snapshot';
  data: NativeProjectSnapshot;
}

export type NativeJobSubmitInput = {
  projectId: string;
  maxAttempts?: number;
  leaseMs?: number;
} & {
  [TKind in SupportedNativeJobKind]: {
    kind: TKind;
    payload?: NativeJobPayloadMap[TKind];
  }
}[SupportedNativeJobKind];
