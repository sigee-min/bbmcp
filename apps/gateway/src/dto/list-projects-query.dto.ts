import { IsOptional, IsString } from 'class-validator';

export class ListProjectsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;
}
