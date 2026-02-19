import { IsOptional, IsString, MinLength } from 'class-validator';

export class AuthUpdateLocalCredentialDto {
  @IsOptional()
  @IsString()
  loginId?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  passwordConfirm?: string;
}
