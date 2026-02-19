import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWorkspaceDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  @MaxLength(96)
  name!: string;

  @IsOptional()
  @IsIn(['all_open', 'rbac'])
  mode?: 'all_open' | 'rbac';
}
