import { IsString } from 'class-validator';

export class RevokeServiceApiKeyDto {
  @IsString()
  keyId!: string;
}
