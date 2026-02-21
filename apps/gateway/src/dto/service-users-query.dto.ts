import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const SERVICE_USER_QUERY_FIELDS = [
  'any',
  'accountId',
  'displayName',
  'email',
  'localLoginId',
  'githubLogin'
] as const;

const SERVICE_QUERY_MATCH_MODES = ['exact', 'prefix', 'contains'] as const;

export class ServiceUsersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(SERVICE_USER_QUERY_FIELDS)
  field?: (typeof SERVICE_USER_QUERY_FIELDS)[number];

  @IsOptional()
  @IsIn(SERVICE_QUERY_MATCH_MODES)
  match?: (typeof SERVICE_QUERY_MATCH_MODES)[number];

  @IsOptional()
  @IsString()
  workspaceId?: string;

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
