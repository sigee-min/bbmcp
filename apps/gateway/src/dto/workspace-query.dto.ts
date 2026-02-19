import { IsOptional, IsString } from 'class-validator';

export class WorkspaceQueryDto {
  @IsOptional()
  @IsString()
  workspaceId?: string;
}
