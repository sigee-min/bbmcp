import { useCallback, useState } from 'react';

import { buildGatewayApiUrl } from '../../lib/gatewayApi';

const requestGatewayMutation = async (
  path: string,
  method: string,
  body?: Record<string, unknown>
): Promise<void> => {
  const response = await fetch(buildGatewayApiUrl(path), {
    method,
    headers: {
      'content-type': 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const candidate = payload as { ok?: boolean; message?: unknown } | null;
  if (!response.ok || !candidate?.ok) {
    const message = typeof candidate?.message === 'string' ? candidate.message : `Request failed (${response.status})`;
    throw new Error(message);
  }
};

const promptName = (title: string, fallback: string): string | null => {
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
    return null;
  }
  const result = window.prompt(title, fallback);
  if (result === null) {
    return null;
  }
  const trimmed = result.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
};

interface UseProjectTreeMutationsOptions {
  reloadProjectsSnapshot: () => Promise<void>;
}

export function useProjectTreeMutations({ reloadProjectsSnapshot }: UseProjectTreeMutationsOptions) {
  const [mutationBusy, setMutationBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const runMutationAndReload = useCallback(
    async (mutation: () => Promise<void>) => {
      setMutationBusy(true);
      setMutationError(null);
      try {
        await mutation();
        await reloadProjectsSnapshot();
      } catch (error) {
        const message = error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
        setMutationError(message);
      } finally {
        setMutationBusy(false);
      }
    },
    [reloadProjectsSnapshot]
  );

  const clearMutationError = useCallback(() => {
    setMutationError(null);
  }, []);

  const onCreateFolder = useCallback(
    async (parentFolderId: string | null) => {
      const name = promptName('폴더 이름을 입력하세요', 'New Folder');
      if (!name) {
        return;
      }
      await runMutationAndReload(async () => {
        await requestGatewayMutation('/folders', 'POST', {
          name,
          ...(parentFolderId ? { parentFolderId } : {})
        });
      });
    },
    [runMutationAndReload]
  );

  const onCreateProject = useCallback(
    async (parentFolderId: string | null) => {
      const name = promptName('프로젝트 이름을 입력하세요', 'New Project');
      if (!name) {
        return;
      }
      await runMutationAndReload(async () => {
        await requestGatewayMutation('/projects', 'POST', {
          name,
          ...(parentFolderId ? { parentFolderId } : {})
        });
      });
    },
    [runMutationAndReload]
  );

  const onRenameFolder = useCallback(
    async (folderId: string, currentName: string) => {
      const nextName = promptName('폴더 새 이름', currentName);
      if (!nextName || nextName === currentName) {
        return;
      }
      await runMutationAndReload(async () => {
        await requestGatewayMutation(`/folders/${encodeURIComponent(folderId)}`, 'PATCH', {
          name: nextName
        });
      });
    },
    [runMutationAndReload]
  );

  const onRenameProject = useCallback(
    async (projectId: string, currentName: string) => {
      const nextName = promptName('프로젝트 새 이름', currentName);
      if (!nextName || nextName === currentName) {
        return;
      }
      await runMutationAndReload(async () => {
        await requestGatewayMutation(`/projects/${encodeURIComponent(projectId)}`, 'PATCH', {
          name: nextName
        });
      });
    },
    [runMutationAndReload]
  );

  const onDeleteFolder = useCallback(
    async (folderId: string, currentName: string) => {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const confirmed = window.confirm(`"${currentName}" 폴더를 삭제할까요? 하위 폴더/프로젝트도 함께 삭제됩니다.`);
        if (!confirmed) {
          return;
        }
      }
      await runMutationAndReload(async () => {
        await requestGatewayMutation(`/folders/${encodeURIComponent(folderId)}`, 'DELETE');
      });
    },
    [runMutationAndReload]
  );

  const onDeleteProject = useCallback(
    async (projectId: string, currentName: string) => {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const confirmed = window.confirm(`"${currentName}" 프로젝트를 삭제할까요?`);
        if (!confirmed) {
          return;
        }
      }
      await runMutationAndReload(async () => {
        await requestGatewayMutation(`/projects/${encodeURIComponent(projectId)}`, 'DELETE');
      });
    },
    [runMutationAndReload]
  );

  const onMoveFolder = useCallback(
    async (folderId: string, parentFolderId: string | null, index?: number) => {
      await runMutationAndReload(async () => {
        await requestGatewayMutation(`/folders/${encodeURIComponent(folderId)}/move`, 'POST', {
          ...(parentFolderId ? { parentFolderId } : {}),
          ...(typeof index === 'number' ? { index } : {})
        });
      });
    },
    [runMutationAndReload]
  );

  const onMoveProject = useCallback(
    async (projectId: string, parentFolderId: string | null, index?: number) => {
      await runMutationAndReload(async () => {
        await requestGatewayMutation(`/projects/${encodeURIComponent(projectId)}/move`, 'POST', {
          ...(parentFolderId ? { parentFolderId } : {}),
          ...(typeof index === 'number' ? { index } : {})
        });
      });
    },
    [runMutationAndReload]
  );

  return {
    mutationBusy,
    mutationError,
    clearMutationError,
    onCreateFolder,
    onCreateProject,
    onRenameFolder,
    onRenameProject,
    onDeleteFolder,
    onDeleteProject,
    onMoveFolder,
    onMoveProject
  };
}
