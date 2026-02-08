export const resolveTextureSize = (
  primary: { width?: number; height?: number },
  ...fallbacks: Array<{ width?: number; height?: number } | undefined>
): { width?: number; height?: number } => {
  const pick = (value?: number): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
  const candidates = [primary, ...fallbacks].filter(Boolean) as Array<{ width?: number; height?: number }>;
  let width: number | undefined;
  let height: number | undefined;
  candidates.forEach((entry) => {
    if (width === undefined) width = pick(entry.width);
    if (height === undefined) height = pick(entry.height);
  });
  return { width, height };
};



