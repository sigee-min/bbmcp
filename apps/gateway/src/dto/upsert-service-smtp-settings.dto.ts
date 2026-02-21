import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpsertServiceSmtpSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  fromEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  fromName?: string;
}
