import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

export const COLOR_TRANSFORM_FORMULA = Object.freeze({
  HSL_COMPLEMENT: 'hsl-complement',
  RGB_INVERT: 'rgb-invert'
});

export const DEFAULT_COLOR_TRANSFORM_FORMULA = COLOR_TRANSFORM_FORMULA.HSL_COMPLEMENT;

const clampByte = (value) => Math.min(255, Math.max(0, Math.round(value)));
const clampUnit = (value) => Math.min(1, Math.max(0, value));

export const rgbToHsl = ({ r, g, b }) => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === rn) {
      hue = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      hue = (bn - rn) / delta + 2;
    } else {
      hue = (rn - gn) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  return { h: hue, s: saturation, l: lightness };
};

const hueToChannel = (p, q, t) => {
  let normalized = t;
  if (normalized < 0) normalized += 1;
  if (normalized > 1) normalized -= 1;
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
  if (normalized < 1 / 2) return q;
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
  return p;
};

export const hslToRgb = ({ h, s, l }) => {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clampUnit(s);
  const lightness = clampUnit(l);

  if (saturation === 0) {
    const gray = clampByte(lightness * 255);
    return { r: gray, g: gray, b: gray };
  }

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const hn = hue / 360;

  return {
    r: clampByte(hueToChannel(p, q, hn + 1 / 3) * 255),
    g: clampByte(hueToChannel(p, q, hn) * 255),
    b: clampByte(hueToChannel(p, q, hn - 1 / 3) * 255)
  };
};

export const applyHslComplement = ({ r, g, b }, options = {}) => {
  const lightnessAdjustment = typeof options.lightnessAdjustment === 'number' ? options.lightnessAdjustment : 0;
  const invertLightness = options.invertLightness === true;
  const hsl = rgbToHsl({ r, g, b });
  const complemented = {
    h: (hsl.h + 180) % 360,
    s: hsl.s,
    l: clampUnit((invertLightness ? 1 - hsl.l : hsl.l) + lightnessAdjustment)
  };
  return hslToRgb(complemented);
};

export const applyRgbInvert = ({ r, g, b }) => ({
  r: 255 - r,
  g: 255 - g,
  b: 255 - b
});

export const createColorTransformer = (formula = DEFAULT_COLOR_TRANSFORM_FORMULA, options = {}) => {
  if (formula === COLOR_TRANSFORM_FORMULA.HSL_COMPLEMENT) {
    return (pixel) => applyHslComplement(pixel, options);
  }
  if (formula === COLOR_TRANSFORM_FORMULA.RGB_INVERT) {
    return (pixel) => applyRgbInvert(pixel);
  }
  throw new Error(`Unsupported color transform formula: ${formula}`);
};

export const transformRgbaBuffer = (rgbaBuffer, transformer) => {
  if (rgbaBuffer.length % 4 !== 0) {
    throw new Error(`RGBA buffer length must be divisible by 4 (received: ${rgbaBuffer.length})`);
  }

  const transformed = Buffer.from(rgbaBuffer);
  for (let index = 0; index < transformed.length; index += 4) {
    const alpha = transformed[index + 3];
    if (alpha === 0) {
      continue;
    }
    const next = transformer({
      r: transformed[index],
      g: transformed[index + 1],
      b: transformed[index + 2]
    });
    transformed[index] = clampByte(next.r);
    transformed[index + 1] = clampByte(next.g);
    transformed[index + 2] = clampByte(next.b);
  }

  return transformed;
};

export const transformPngBuffer = (pngBuffer, options = {}) => {
  const formula = options.formula ?? DEFAULT_COLOR_TRANSFORM_FORMULA;
  const transformer = createColorTransformer(formula, options);
  const image = PNG.sync.read(pngBuffer);
  image.data = transformRgbaBuffer(image.data, transformer);
  return PNG.sync.write(image);
};

export const transformPngFile = ({ inputPath, outputPath, formula = DEFAULT_COLOR_TRANSFORM_FORMULA, ...options }) => {
  const source = readFileSync(inputPath);
  const transformed = transformPngBuffer(source, { formula, ...options });
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, transformed);
};
