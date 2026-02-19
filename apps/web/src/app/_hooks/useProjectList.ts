'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';

import {
  applyDashboardError,
  createLoadedState,
  replaceProjectTree,
  type DashboardState,
  type ProjectSnapshot,
  type ProjectTreeSnapshot
} from '../../lib/dashboardModel';
import { buildGatewayApiUrl } from '../../lib/gatewayApi';

interface ProjectsResponse {
  ok: boolean;
  projects: readonly ProjectSnapshot[];
  tree: ProjectTreeSnapshot;
}

interface UseProjectListOptions {
  setState: Dispatch<SetStateAction<DashboardState>>;
  workspaceId: string;
  requestHeaders?: Record<string, string>;
  enabled?: boolean;
  reloadVersion?: number;
}

const toProjectsTreeUrl = (workspaceId: string): string => {
  const normalizedWorkspaceId = workspaceId.trim();
  const basePath = buildGatewayApiUrl('/projects/tree');
  if (!normalizedWorkspaceId) {
    return basePath;
  }
  return `${basePath}?workspaceId=${encodeURIComponent(normalizedWorkspaceId)}`;
};

export const useProjectList = ({
  setState,
  workspaceId,
  requestHeaders,
  enabled = true,
  reloadVersion = 0
}: UseProjectListOptions): void => {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;

    setState((prev) => {
      if (prev.projects.length > 0) {
        return prev;
      }
      return {
        ...prev,
        status: 'loading',
        errorCode: null
      };
    });

    const loadProjects = async () => {
      try {
        const response = await fetch(toProjectsTreeUrl(workspaceId), {
          cache: 'no-store',
          ...(requestHeaders ? { headers: requestHeaders } : {})
        });
        if (!response.ok) {
          throw new Error(`project list failed: ${response.status}`);
        }
        const payload = (await response.json()) as ProjectsResponse;
        if (!payload.ok) {
          throw new Error('project list failed');
        }
        if (cancelled) {
          return;
        }
        setState((prev) => {
          if (prev.projects.length === 0) {
            return createLoadedState(payload.projects, payload.tree, prev.selectedProjectId);
          }
          return replaceProjectTree(prev, payload.projects, payload.tree);
        });
      } catch {
        if (cancelled) {
          return;
        }
        setState((prev) => applyDashboardError(prev, 'project_load_failed'));
      }
    };

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadVersion, requestHeaders, setState, workspaceId]);
};
