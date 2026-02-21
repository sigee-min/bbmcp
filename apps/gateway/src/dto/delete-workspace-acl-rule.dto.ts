import { IsString } from 'class-validator';

export class DeleteWorkspaceAclRuleDto {
  @IsString()
  ruleId!: string;
}
