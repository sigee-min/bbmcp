import { Type } from 'class-transformer';
import { IsArray, IsString } from 'class-validator';

export class UpsertWorkspaceMemberDto {
  @IsString()
  accountId!: string;

  @IsArray()
  @Type(() => String)
  @IsString({ each: true })
  roleIds!: string[];
}
