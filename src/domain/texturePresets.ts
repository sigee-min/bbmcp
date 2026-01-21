export type TexturePresetName =
  | 'painted_metal'
  | 'rubber'
  | 'glass'
  | 'wood'
  | 'dirt'
  | 'plant'
  | 'stone'
  | 'sand'
  | 'leather'
  | 'fabric'
  | 'ceramic';

export type TexturePresetSpec = {
  preset: TexturePresetName;
  width: number;
  height: number;
  seed?: number;
  palette?: string[];
};

export type TextureCoverage = {
  opaquePixels: number;
  totalPixels: number;
  opaqueRatio: number;
  bounds?: { x1: number; y1: number; x2: number; y2: number };
};

export type TexturePresetResult = {
  width: number;
  height: number;
  seed: number;
  data: Uint8ClampedArray;
  coverage: TextureCoverage;
};

type Rgb = { r: number; g: number; b: number };

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const hashText = (value: string): number => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
};

const resolveSeed = (seed: number | undefined, fallback: string) =>
  Number.isFinite(seed) ? (seed as number) : hashText(fallback);

const createRng = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
};

const parseHex = (value: string, fallback: Rgb): Rgb => {
  const hex = String(value ?? '').replace('#', '');
  if (hex.length !== 6) return fallback;
  const n = Number.parseInt(hex, 16);
  if (!Number.isFinite(n)) return fallback;
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
};

const shade = (color: Rgb, delta: number): Rgb => ({
  r: clampByte(color.r + delta),
  g: clampByte(color.g + delta),
  b: clampByte(color.b + delta)
});

const setPixel = (data: Uint8ClampedArray, width: number, x: number, y: number, color: Rgb) => {
  const idx = (y * width + x) * 4;
  data[idx] = color.r;
  data[idx + 1] = color.g;
  data[idx + 2] = color.b;
  data[idx + 3] = 255;
};

const resolvePalette = (defaults: Record<string, string>, palette?: string[]) => ({
  base: palette?.[0] ?? defaults.base,
  dark: palette?.[1] ?? defaults.dark,
  light: palette?.[2] ?? defaults.light,
  accent: palette?.[3] ?? defaults.accent,
  accent2: palette?.[4] ?? defaults.accent2
});

const analyzeCoverage = (data: Uint8ClampedArray, width: number, height: number): TextureCoverage => {
  const totalPixels = width * height;
  let opaquePixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    opaquePixels += 1;
    const idx = i / 4;
    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const bounds =
    opaquePixels > 0 ? { x1: minX, y1: minY, x2: maxX, y2: maxY } : undefined;
  return {
    opaquePixels,
    totalPixels,
    opaqueRatio: totalPixels > 0 ? opaquePixels / totalPixels : 0,
    bounds
  };
};

const generatePaintedMetal = (spec: TexturePresetSpec, data: Uint8ClampedArray) => {
  const palette = resolvePalette(
    { base: '#c6372e', dark: '#9f2c25', light: '#d94b3b', accent: '#b3352a', accent2: '#7d1f1a' },
    spec.palette
  );
  const base = parseHex(palette.base, { r: 198, g: 55, b: 46 });
  const dark = parseHex(palette.dark, base);
  const light = parseHex(palette.light, base);
  const accent = parseHex(palette.accent, dark);
  const accent2 = parseHex(palette.accent2, dark);
  const rand = createRng(resolveSeed(spec.seed, `painted_metal:${spec.width}x${spec.height}`));
  const highlightRows = Math.max(2, Math.floor(spec.height * 0.15));
  const bandStart = Math.floor(spec.height * 0.35);
  const bandEnd = Math.min(spec.height, bandStart + Math.max(2, Math.floor(spec.height * 0.12)));
  for (let y = 0; y < spec.height; y += 1) {
    const inHighlight = y < highlightRows;
    const inBand = y >= bandStart && y <= bandEnd;
    for (let x = 0; x < spec.width; x += 1) {
      let color = base;
      const n = rand();
      if (n < 0.05) color = light;
      else if (n > 0.95) color = dark;
      if (inHighlight && x % 6 < 4) color = shade(light, 8);
      if (inBand && x % 6 < 3) color = shade(dark, -8);
      if (x % 12 === 0) color = accent;
      if (x % 24 === 0 && y % 8 < 2) color = accent2;
      setPixel(data, spec.width, x, y, color);
    }
  }
};

const generateRubber = (spec: TexturePresetSpec, data: Uint8ClampedArray) => {
  const palette = resolvePalette(
    { base: '#2f2f2f', dark: '#1f1f1f', light: '#4a4a4a', accent: '#5c5c5c', accent2: '#101010' },
    spec.palette
  );
  const base = parseHex(palette.base, { r: 47, g: 47, b: 47 });
  const dark = parseHex(palette.dark, base);
  const light = parseHex(palette.light, base);
  const accent = parseHex(palette.accent, light);
  const rand = createRng(resolveSeed(spec.seed, `rubber:${spec.width}x${spec.height}`));
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      let color = base;
      if ((x + y) % 10 < 2 || (x - y + spec.width) % 12 < 2) color = dark;
      if (x % 8 === 0 || y % 8 === 0) color = accent;
      const n = rand();
      if (n < 0.04) color = light;
      else if (n > 0.97) color = dark;
      setPixel(data, spec.width, x, y, color);
    }
  }
};

const generateGlass = (spec: TexturePresetSpec, data: Uint8ClampedArray) => {
  const palette = resolvePalette(
    { base: '#4f86c6', dark: '#3a6ea8', light: '#6fb2e2', accent: '#8fd0f2', accent2: '#2d5e92' },
    spec.palette
  );
  const base = parseHex(palette.base, { r: 79, g: 134, b: 198 });
  const dark = parseHex(palette.dark, base);
  const light = parseHex(palette.light, base);
  const accent = parseHex(palette.accent, light);
  const accent2 = parseHex(palette.accent2, dark);
  const rand = createRng(resolveSeed(spec.seed, `glass:${spec.width}x${spec.height}`));
  for (let y = 0; y < spec.height; y += 1) {
    const gradient = 1 - y / Math.max(1, spec.height - 1);
    const tint = gradient > 0.7 ? 8 : gradient > 0.45 ? 4 : 0;
    for (let x = 0; x < spec.width; x += 1) {
      let color = shade(base, tint);
      if (x - y > 4 && x - y < 10) color = accent;
      if (x + y > spec.width + spec.height - 10) color = accent2;
      if (x === 0 || y === 0 || x === spec.width - 1 || y === spec.height - 1) color = dark;
      const n = rand();
      if (n < 0.03) color = light;
      else if (n > 0.98) color = dark;
      setPixel(data, spec.width, x, y, color);
    }
  }
};

const generateWood = (spec: TexturePresetSpec, data: Uint8ClampedArray) => {
  const palette = resolvePalette(
    { base: '#b68654', dark: '#8f5f32', light: '#c99a64', accent: '#5a3b1f', accent2: '#d6aa70' },
    spec.palette
  );
  const base = parseHex(palette.base, { r: 182, g: 134, b: 84 });
  const dark = parseHex(palette.dark, base);
  const light = parseHex(palette.light, base);
  const seam = parseHex(palette.accent, dark);
  const rand = createRng(resolveSeed(spec.seed, `wood:${spec.width}x${spec.height}`));
  const planks = Math.max(2, Math.floor(spec.width / 12));
  const plankWidth = Math.floor(spec.width / planks);
  const plankBases = Array.from({ length: planks }, () =>
    rand() < 0.5 ? base : shade(base, rand() < 0.5 ? -8 : 8)
  );
  for (let y = 0; y < spec.height; y += 1) {
    const grain = y % 6 === 0 || y % 7 === 0;
    for (let x = 0; x < spec.width; x += 1) {
      const plank = Math.min(planks - 1, Math.floor(x / plankWidth));
      const xIn = x % plankWidth;
      let color = plankBases[plank];
      if (xIn === 0) color = seam;
      if (grain && rand() < 0.5) color = dark;
      const n = rand();
      if (n < 0.06) color = light;
      else if (n > 0.94) color = dark;
      setPixel(data, spec.width, x, y, color);
    }
  }
};

const generateDirt = (spec: TexturePresetSpec, data: Uint8ClampedArray) => {
  const palette = resolvePalette(
    { base: '#4b2f1a', dark: '#3a2414', light: '#5a3a20', accent: '#2f1c10', accent2: '#6b4526' },
    spec.palette
  );
  const base = parseHex(palette.base, { r: 75, g: 47, b: 26 });
  const dark = parseHex(palette.dark, base);
  const light = parseHex(palette.light, base);
  const accent = parseHex(palette.accent, dark);
  const rand = createRng(resolveSeed(spec.seed, `dirt:${spec.width}x${spec.height}`));
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      let color = base;
      const n = rand();
      if (n < 0.08) color = light;
      else if (n > 0.93) color = dark;
      if ((x + y) % 7 === 0 && rand() < 0.4) color = accent;
      setPixel(data, spec.width, x, y, color);
    }
  }
};

const generatePlant = (spec: TexturePresetSpec, data: Uint8ClampedArray) => {
  const palette = resolvePalette(
    { base: '#3f8a3a', dark: '#2f6e2c', light: '#56a94e', accent: '#7acb64', accent2: '#1f5a1c' },
    spec.palette
  );
  const base = parseHex(palette.base, { r: 63, g: 138, b: 58 });
  const dark = parseHex(palette.dark, base);
  const light = parseHex(palette.light, base);
  const accent = parseHex(palette.accent, light);
  const rand = createRng(resolveSeed(spec.seed, `plant:${spec.width}x${spec.height}`));
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      let color = base;
      if (x % 7 === 0 && rand() < 0.6) color = accent;
      if (y % 6 === 0 && rand() < 0.5) color = dark;
      const n = rand();
      if (n < 0.05) color = light;
      else if (n > 0.95) color = dark;
      setPixel(data, spec.width, x, y, color);
    }
  }
};

const generateStone = (spec: TexturePresetSpec, data: Uint8ClampedArray) => {
  const palette = resolvePalette(
    { base: '#7a7a7a', dark: '#5f5f5f', light: '#9a9a9a', accent: '#4c4c4c', accent2: '#b0b0b0' },
    spec.palette
  );
  const base = parseHex(palette.base, { r: 122, g: 122, b: 122 });
  const dark = parseHex(palette.dark, base);
  const light = parseHex(palette.light, base);
  const accent = parseHex(palette.accent, dark);
  const accent2 = parseHex(palette.accent2, light);
  const rand = createRng(resolveSeed(spec.seed, `stone:${spec.width}x${spec.height}`));
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      let color = base;
      const n = rand();
      if (n < 0.08) color = light;
      else if (n > 0.93) color = dark;
      if ((x * 3 + y * 5) % 37 === 0 && rand() < 0.6) color = accent;
      if ((x + y) % 17 === 0 && rand() < 0.35) color = accent2;
      if (((x >> 2) + (y >> 2)) % 3 === 0 && rand() < 0.12) color = dark;
      setPixel(data, spec.width, x, y, color);
    }
  }
};

const generateSand = (spec: TexturePresetSpec, data: Uint8ClampedArray) => {
  const palette = resolvePalette(
    { base: '#d8c08a', dark: '#bfa46f', light: '#eed7a3', accent: '#c9b27d', accent2: '#f4e4be' },
    spec.palette
  );
  const base = parseHex(palette.base, { r: 216, g: 192, b: 138 });
  const dark = parseHex(palette.dark, base);
  const light = parseHex(palette.light, base);
  const accent = parseHex(palette.accent, base);
  const accent2 = parseHex(palette.accent2, light);
  const rand = createRng(resolveSeed(spec.seed, `sand:${spec.width}x${spec.height}`));
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      let color = base;
      const n = rand();
      if (n < 0.12) color = light;
      else if (n > 0.96) color = dark;
      if ((x + y) % 5 === 0 && rand() < 0.35) color = accent;
      if ((x * 2 - y + spec.width) % 11 === 0 && rand() < 0.2) color = accent2;
      setPixel(data, spec.width, x, y, color);
    }
  }
};

const generateLeather = (spec: TexturePresetSpec, data: Uint8ClampedArray) => {
  const palette = resolvePalette(
    { base: '#7b4b2a', dark: '#5c3620', light: '#9b6a3c', accent: '#4a2d1a', accent2: '#b58354' },
    spec.palette
  );
  const base = parseHex(palette.base, { r: 123, g: 75, b: 42 });
  const dark = parseHex(palette.dark, base);
  const light = parseHex(palette.light, base);
  const accent = parseHex(palette.accent, dark);
  const accent2 = parseHex(palette.accent2, light);
  const rand = createRng(resolveSeed(spec.seed, `leather:${spec.width}x${spec.height}`));
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      let color = base;
      if ((x + y) % 9 === 0 && rand() < 0.5) color = dark;
      if (x % 11 === 0 && rand() < 0.2) color = accent;
      const n = rand();
      if (n < 0.06) color = light;
      else if (n > 0.95) color = dark;
      if (y % 8 === 0 && rand() < 0.25) color = accent2;
      setPixel(data, spec.width, x, y, color);
    }
  }
};

const generateFabric = (spec: TexturePresetSpec, data: Uint8ClampedArray) => {
  const palette = resolvePalette(
    { base: '#7b7f8a', dark: '#5f626c', light: '#a0a5b0', accent: '#9096a3', accent2: '#4f525b' },
    spec.palette
  );
  const base = parseHex(palette.base, { r: 123, g: 127, b: 138 });
  const dark = parseHex(palette.dark, base);
  const light = parseHex(palette.light, base);
  const accent = parseHex(palette.accent, light);
  const accent2 = parseHex(palette.accent2, dark);
  const rand = createRng(resolveSeed(spec.seed, `fabric:${spec.width}x${spec.height}`));
  for (let y = 0; y < spec.height; y += 1) {
    const weaveY = y % 4;
    for (let x = 0; x < spec.width; x += 1) {
      const weaveX = x % 4;
      let color = base;
      if (weaveX === 0 || weaveY === 0) color = dark;
      if (weaveX === 2 && weaveY === 2) color = accent;
      if (weaveX === 0 && weaveY === 0) color = accent2;
      const n = rand();
      if (n < 0.05) color = light;
      else if (n > 0.98) color = dark;
      setPixel(data, spec.width, x, y, color);
    }
  }
};

const generateCeramic = (spec: TexturePresetSpec, data: Uint8ClampedArray) => {
  const palette = resolvePalette(
    { base: '#d7d7d1', dark: '#b8b8b1', light: '#f0f0ea', accent: '#c6c6bf', accent2: '#ffffff' },
    spec.palette
  );
  const base = parseHex(palette.base, { r: 215, g: 215, b: 209 });
  const dark = parseHex(palette.dark, base);
  const light = parseHex(palette.light, base);
  const accent = parseHex(palette.accent, base);
  const accent2 = parseHex(palette.accent2, light);
  const rand = createRng(resolveSeed(spec.seed, `ceramic:${spec.width}x${spec.height}`));
  const denom = Math.max(1, spec.width + spec.height - 2);
  for (let y = 0; y < spec.height; y += 1) {
    for (let x = 0; x < spec.width; x += 1) {
      const gradient = 1 - (x + y) / denom;
      const tint = gradient > 0.7 ? 6 : gradient > 0.45 ? 3 : 0;
      let color = shade(base, tint);
      if (x === 0 || y === 0 || x === spec.width - 1 || y === spec.height - 1) color = dark;
      const n = rand();
      if (n < 0.04) color = light;
      else if (n > 0.98) color = accent;
      if ((x + y) % 13 === 0 && rand() < 0.08) color = accent2;
      setPixel(data, spec.width, x, y, color);
    }
  }
};

export const generateTexturePreset = (spec: TexturePresetSpec): TexturePresetResult => {
  const width = Math.max(1, Math.floor(spec.width));
  const height = Math.max(1, Math.floor(spec.height));
  const seed = resolveSeed(spec.seed, `${spec.preset}:${width}x${height}`);
  const data = new Uint8ClampedArray(width * height * 4);
  const presetSpec = { ...spec, width, height, seed };
  switch (spec.preset) {
    case 'painted_metal':
      generatePaintedMetal(presetSpec, data);
      break;
    case 'rubber':
      generateRubber(presetSpec, data);
      break;
    case 'glass':
      generateGlass(presetSpec, data);
      break;
    case 'wood':
      generateWood(presetSpec, data);
      break;
    case 'dirt':
      generateDirt(presetSpec, data);
      break;
    case 'plant':
      generatePlant(presetSpec, data);
      break;
    case 'stone':
      generateStone(presetSpec, data);
      break;
    case 'sand':
      generateSand(presetSpec, data);
      break;
    case 'leather':
      generateLeather(presetSpec, data);
      break;
    case 'fabric':
      generateFabric(presetSpec, data);
      break;
    case 'ceramic':
      generateCeramic(presetSpec, data);
      break;
    default:
      generatePaintedMetal(presetSpec, data);
      break;
  }
  const coverage = analyzeCoverage(data, width, height);
  return { width, height, seed, data, coverage };
};
