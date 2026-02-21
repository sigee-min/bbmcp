import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class UpsertWorkspaceAclRuleDto {
  @IsOptional()
  @IsString()
  folderId?: string | null;

  @IsOptional()
  @IsString()
  ruleId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleIds!: string[];

  @IsIn(['allow', 'deny', 'inherit'])
  read!: 'allow' | 'deny' | 'inherit';

  @IsIn(['allow', 'deny', 'inherit'])
  write!: 'allow' | 'deny' | 'inherit';
}
