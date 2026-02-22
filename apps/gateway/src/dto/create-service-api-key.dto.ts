import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateServiceApiKeyDto {
  @IsString()
  @MaxLength(96)
  name!: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
