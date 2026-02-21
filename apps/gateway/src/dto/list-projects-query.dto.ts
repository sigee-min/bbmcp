import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ListProjectsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsString()
  @IsNotEmpty()
  workspaceId!: string;
}
