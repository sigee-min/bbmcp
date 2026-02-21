import { IsArray, IsString } from 'class-validator';

export class SetServiceAccountRolesDto {
  @IsArray()
  @IsString({ each: true })
  systemRoles!: string[];
}
