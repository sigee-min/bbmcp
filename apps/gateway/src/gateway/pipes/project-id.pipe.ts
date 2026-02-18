import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ProjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('Invalid project id.');
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException('Invalid project id.');
    }
    return trimmed;
  }
}
