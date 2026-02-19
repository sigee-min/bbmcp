import { IsOptional, IsString } from 'class-validator';

export class WorkspaceFolderAclQueryDto {
  @IsOptional()
  @IsString()
  folderId?: string;
}
