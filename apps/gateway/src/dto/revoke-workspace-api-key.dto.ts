import { IsString } from 'class-validator';

export class RevokeWorkspaceApiKeyDto {
  @IsString()
  keyId!: string;
}
