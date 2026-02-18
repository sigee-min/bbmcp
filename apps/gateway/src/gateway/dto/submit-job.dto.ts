import { Allow, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitJobDto {
  @Allow()
  kind?: unknown;

  @Allow()
  payload?: unknown;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxAttempts must be a positive integer' })
  @Min(1, { message: 'maxAttempts must be a positive integer' })
  maxAttempts?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'leaseMs must be a positive integer' })
  @Min(1, { message: 'leaseMs must be a positive integer' })
  leaseMs?: number;
}
