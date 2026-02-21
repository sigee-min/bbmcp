import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const SERVICE_WORKSPACE_QUERY_FIELDS = ['any', 'workspaceId', 'name', 'createdBy', 'memberAccountId'] as const;
const SERVICE_QUERY_MATCH_MODES = ['exact', 'prefix', 'contains'] as const;

export class ServiceWorkspacesQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(SERVICE_WORKSPACE_QUERY_FIELDS)
  field?: (typeof SERVICE_WORKSPACE_QUERY_FIELDS)[number];

  @IsOptional()
  @IsIn(SERVICE_QUERY_MATCH_MODES)
  match?: (typeof SERVICE_QUERY_MATCH_MODES)[number];

  @IsOptional()
  @IsString()
  memberAccountId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
