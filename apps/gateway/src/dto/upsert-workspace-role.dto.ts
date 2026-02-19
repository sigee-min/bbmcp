import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertWorkspaceRoleDto {
  @IsString()
  roleId!: string;

  @IsString()
  @MaxLength(96)
  name!: string;

  @IsOptional()
  @IsIn(['workspace_admin', 'user'])
  builtin?: 'workspace_admin' | 'user';

  @IsArray()
  @Type(() => String)
  @IsString({ each: true })
  permissions!: string[];
}
