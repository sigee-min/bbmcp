import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertWorkspaceRoleDto {
  @IsOptional()
  @IsString()
  roleId?: string;

  @IsString()
  @MaxLength(96)
  name!: string;
}
