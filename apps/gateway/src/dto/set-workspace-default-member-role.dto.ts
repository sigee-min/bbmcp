import { IsString } from 'class-validator';

export class SetWorkspaceDefaultMemberRoleDto {
  @IsString()
  roleId!: string;
}
