import { IsIn } from 'class-validator';

export class UpdateWorkspaceModeDto {
  @IsIn(['all_open', 'rbac'])
  mode!: 'all_open' | 'rbac';
}
