import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class MoveEntityDto {
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @IsOptional()
  @IsString()
  parentFolderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  index?: number;
}
