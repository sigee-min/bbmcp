import { IsString } from 'class-validator';

export class RenameEntityDto {
  @IsString()
  name!: string;
}
