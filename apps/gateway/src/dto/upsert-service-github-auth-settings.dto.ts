import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertServiceGithubAuthSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  clientSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  callbackUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  scopes?: string;
}
