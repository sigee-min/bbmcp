import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpsertWorkspaceFolderAclDto {
  @IsOptional()
  @IsString()
  folderId?: string | null;

  @IsString()
  roleId!: string;

  @IsIn(['allow', 'deny', 'inherit'])
  read!: 'allow' | 'deny' | 'inherit';

  @IsIn(['allow', 'deny', 'inherit'])
  write!: 'allow' | 'deny' | 'inherit';
}
