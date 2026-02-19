import { IsString, MinLength } from 'class-validator';

export class AuthLoginDto {
  @IsString()
  loginId!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
