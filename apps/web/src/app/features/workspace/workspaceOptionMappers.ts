import type {
  ProjectTreeSnapshot,
  WorkspaceMemberCandidateRecord,
  WorkspaceRoleRecord
} from '../../../lib/dashboardModel';

export type WorkspaceRoleOption = {
  roleId: string;
  label: string;
  builtin: WorkspaceRoleRecord['builtin'];
};

export type WorkspaceMemberCandidateOption = {
  accountId: string;
  label: string;
  description: string;
};

export type WorkspaceFolderOption = {
  folderId: string | null;
  label: string;
};

export const toWorkspaceRoleOptions = (roles: readonly WorkspaceRoleRecord[]): WorkspaceRoleOption[] =>
  roles.map((role) => ({
    roleId: role.roleId,
    label: role.name,
    builtin: role.builtin
  }));

export const toWorkspaceMemberCandidateOptions = (
  candidates: readonly WorkspaceMemberCandidateRecord[]
): WorkspaceMemberCandidateOption[] =>
  candidates.map((candidate) => {
    const displayName = candidate.displayName.trim() || candidate.accountId;
    const descriptionParts = [candidate.email];
    if (candidate.localLoginId) {
      descriptionParts.push(`local:${candidate.localLoginId}`);
    } else if (candidate.githubLogin) {
      descriptionParts.push(`github:${candidate.githubLogin}`);
    }
    return {
      accountId: candidate.accountId,
      label: displayName,
      description: descriptionParts.join(' · ')
    };
  });

export const toWorkspaceFolderOptions = (projectTree: ProjectTreeSnapshot): WorkspaceFolderOption[] => {
  const options: WorkspaceFolderOption[] = [{ folderId: null, label: '루트 (모든 폴더)' }];
  const visit = (nodes: readonly ProjectTreeSnapshot['roots'][number][], parentLabels: readonly string[]) => {
    for (const node of nodes) {
      if (node.kind !== 'folder') {
        continue;
      }
      const path = [...parentLabels, node.name];
      options.push({
        folderId: node.folderId,
        label: path.join(' / ')
      });
      visit(node.children, path);
    }
  };
  visit(projectTree.roots, []);
  return options;
};
