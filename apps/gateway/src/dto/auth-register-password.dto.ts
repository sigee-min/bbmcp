import { IsString, MinLength } from 'class-validator';

export class AuthRegisterPasswordDto {
  @IsString()
  loginId!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
