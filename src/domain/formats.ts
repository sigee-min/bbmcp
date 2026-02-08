import { FormatKind } from '@ashfox/contracts/types/internal';
import { FormatDescriptor } from '../ports/formats';

export type FormatOverrides = Partial<Record<FormatKind, string>>;

export function resolveFormatId(
  kind: FormatKind,
  formats: FormatDescriptor[],
  overrides?: FormatOverrides
): string | null {
  const overrideId = overrides?.[kind];
  if (overrideId) {
    const exists = formats.some((f) => f.id === overrideId);
    if (exists) return overrideId;
  }
  const direct = formats.find((f) => f.id === kind);
  if (direct) return direct.id;

  const scored = formats
    .map((format) => ({ format, score: scoreFormat(kind, format) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0].format.id;
}

function scoreFormat(kind: FormatKind, format: FormatDescriptor): number {
  const haystack = `${format.id} ${format.name ?? ''}`.toLowerCase();
  const patterns = getPatterns(kind);
  let score = 0;
  patterns.forEach((pattern, index) => {
    if (haystack.includes(pattern)) {
      score += (patterns.length - index) * 10;
    }
  });
  return score;
}

export function matchesFormatKind(kind: FormatKind, value: string | null | undefined): boolean {
  if (!value) return false;
  const haystack = String(value).toLowerCase();
  const patterns = getPatterns(kind);
  return patterns.some((pattern) => haystack.includes(pattern));
}

function getPatterns(kind: FormatKind): string[] {
  switch (kind) {
    case 'Java Block/Item':
      return ['java_block', 'java block', 'java_item', 'java item', 'java-block', 'java block/item'];
    case 'geckolib':
      return ['geckolib', 'gecko_lib', 'gecko'];
    case 'animated_java':
      return ['animated_java', 'animated java', 'animated-java', 'animatedjava'];
    case 'Image':
      return ['image', 'bitmap', '2d'];
    case 'Generic Model':
      return ['free', 'generic model', 'generic', 'unity', 'godot', 'unreal'];
    default:
      return [];
  }
}




