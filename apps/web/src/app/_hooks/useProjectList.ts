'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';

import {
  applyDashboardError,
  createLoadedState,
  type DashboardState,
  type ProjectSnapshot
} from '../../lib/dashboardModel';

interface ProjectsResponse {
  ok: boolean;
  projects: readonly ProjectSnapshot[];
}

interface UseProjectListOptions {
  setState: Dispatch<SetStateAction<DashboardState>>;
  reloadVersion?: number;
}

export const useProjectList = ({ setState, reloadVersion = 0 }: UseProjectListOptions): void => {
  useEffect(() => {
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
        const response = await fetch('/api/projects', { cache: 'no-store' });
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
        setState(createLoadedState(payload.projects));
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
  }, [reloadVersion, setState]);
};
