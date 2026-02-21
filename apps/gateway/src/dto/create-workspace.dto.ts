import { IsString, MaxLength } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  @MaxLength(96)
  name!: string;
}
