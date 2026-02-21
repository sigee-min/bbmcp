import { useCallback, useState } from 'react';

import { requestGatewayApi } from '../../lib/gatewayApiClient';

const requestGatewayMutation = async (
  path: string,
  method: string,
  body?: Record<string, unknown>,
  requestHeaders?: Record<string, string>
): Promise<void> => {
  const hasBody = typeof body !== 'undefined';
  const mergedHeaders: Record<string, string> = {
    ...(requestHeaders ?? {})
  };
  if (hasBody) {
    mergedHeaders['content-type'] = 'application/json';
  } else {
    delete mergedHeaders['content-type'];
    delete mergedHeaders['Content-Type'];
  }

  await requestGatewayApi(
    path,
    {
      method,
      headers: mergedHeaders,
      ...(hasBody ? { body: JSON.stringify(body) } : {})
    },
    {
      fallbackMessage: '요청을 처리하지 못했습니다.'
    }
  );
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
  workspaceId: string;
  requestHeaders?: Record<string, string>;
  reloadProjectsSnapshot: () => Promise<void>;
}

const withWorkspaceQuery = (path: string, workspaceId: string): string => {
  const normalized = workspaceId.trim();
  if (!normalized) {
    return path;
  }
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}workspaceId=${encodeURIComponent(normalized)}`;
};

export function useProjectTreeMutations({
  workspaceId,
  requestHeaders,
  reloadProjectsSnapshot
}: UseProjectTreeMutationsOptions) {
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
          workspaceId,
          ...(parentFolderId ? { parentFolderId } : {})
        }, requestHeaders);
      });
    },
    [requestHeaders, runMutationAndReload, workspaceId]
  );

  const onCreateProject = useCallback(
    async (parentFolderId: string | null) => {
      const name = promptName('프로젝트 이름을 입력하세요', '내 프로젝트');
      if (!name) {
        return;
      }
      await runMutationAndReload(async () => {
        await requestGatewayMutation('/projects', 'POST', {
          name,
          workspaceId,
          ...(parentFolderId ? { parentFolderId } : {})
        }, requestHeaders);
      });
    },
    [requestHeaders, runMutationAndReload, workspaceId]
  );

  const onRenameFolder = useCallback(
    async (folderId: string, currentName: string) => {
      const nextName = promptName('폴더 새 이름', currentName);
      if (!nextName || nextName === currentName) {
        return;
      }
      await runMutationAndReload(async () => {
        await requestGatewayMutation(withWorkspaceQuery(`/folders/${encodeURIComponent(folderId)}`, workspaceId), 'PATCH', {
          name: nextName
        }, requestHeaders);
      });
    },
    [requestHeaders, runMutationAndReload, workspaceId]
  );

  const onRenameProject = useCallback(
    async (projectId: string, currentName: string) => {
      const nextName = promptName('프로젝트 새 이름', currentName);
      if (!nextName || nextName === currentName) {
        return;
      }
      await runMutationAndReload(async () => {
        await requestGatewayMutation(withWorkspaceQuery(`/projects/${encodeURIComponent(projectId)}`, workspaceId), 'PATCH', {
          name: nextName
        }, requestHeaders);
      });
    },
    [requestHeaders, runMutationAndReload, workspaceId]
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
        await requestGatewayMutation(
          withWorkspaceQuery(`/folders/${encodeURIComponent(folderId)}`, workspaceId),
          'DELETE',
          undefined,
          requestHeaders
        );
      });
    },
    [requestHeaders, runMutationAndReload, workspaceId]
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
        await requestGatewayMutation(
          withWorkspaceQuery(`/projects/${encodeURIComponent(projectId)}`, workspaceId),
          'DELETE',
          undefined,
          requestHeaders
        );
      });
    },
    [requestHeaders, runMutationAndReload, workspaceId]
  );

  const onMoveFolder = useCallback(
    async (folderId: string, parentFolderId: string | null, index?: number) => {
      await runMutationAndReload(async () => {
        await requestGatewayMutation(`/folders/${encodeURIComponent(folderId)}/move`, 'POST', {
          workspaceId,
          ...(parentFolderId ? { parentFolderId } : {}),
          ...(typeof index === 'number' ? { index } : {})
        }, requestHeaders);
      });
    },
    [requestHeaders, runMutationAndReload, workspaceId]
  );

  const onMoveProject = useCallback(
    async (projectId: string, parentFolderId: string | null, index?: number) => {
      await runMutationAndReload(async () => {
        await requestGatewayMutation(`/projects/${encodeURIComponent(projectId)}/move`, 'POST', {
          workspaceId,
          ...(parentFolderId ? { parentFolderId } : {}),
          ...(typeof index === 'number' ? { index } : {})
        }, requestHeaders);
      });
    },
    [requestHeaders, runMutationAndReload, workspaceId]
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
