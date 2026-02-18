import { IsOptional, IsString } from 'class-validator';

export class StreamQueryDto {
  @IsOptional()
  @IsString()
  lastEventId?: string;
}
