import { IsNotEmpty, IsString } from 'class-validator';

export class WorkspaceQueryDto {
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;
}
