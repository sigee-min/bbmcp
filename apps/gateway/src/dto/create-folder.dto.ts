import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsString()
  parentFolderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  index?: number;
}
