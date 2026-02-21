import type { WorkspaceMemberRecord } from '@ashfox/backend-core';
import { uniqueStrings } from './common';

export type WorkspaceMemberRoleUpdate = {
  accountId: string;
  roleIds: string[];
};

export class SqlWorkspaceRepositoryBase {
  protected normalizeMemberRoleIds(roleIds: readonly string[]): string[] {
    return uniqueStrings(roleIds);
  }

  protected buildMemberRoleRemovalUpdates(
    members: readonly WorkspaceMemberRecord[],
    removedRoleId: string
  ): WorkspaceMemberRoleUpdate[] {
    return members.map((member) => ({
      accountId: member.accountId,
      roleIds: member.roleIds.filter((existingRoleId) => existingRoleId !== removedRoleId)
    }));
  }
}
