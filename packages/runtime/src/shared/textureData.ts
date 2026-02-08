import { hashTextToHex } from './hash';

export const hashCanvasImage = (image: CanvasImageSource | undefined): string | null => {
  if (!image) return null;
  const candidate = image as { toDataURL?: (type?: string) => string };
  if (typeof candidate.toDataURL !== 'function') return null;
  return hashTextToHex(candidate.toDataURL('image/png'));
};

export const parseDataUriMimeType = (dataUri: string): string | null => {
  const match = /^data:([^;]+);base64,/i.exec(String(dataUri ?? ''));
  return match?.[1] ?? null;
};

export const normalizeTextureDataUri = (value?: string): string | null => {
  if (!value) return null;
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
};

export const estimateDataUriByteLength = (dataUri: string): number | null => {
  const raw = String(dataUri ?? '');
  const comma = raw.indexOf(',');
  if (comma === -1) return null;
  const meta = raw.slice(0, comma);
  if (!meta.toLowerCase().includes('base64')) return null;
  const payload = raw.slice(comma + 1).trim().replace(/\s/g, '');
  if (!payload) return null;
  let padding = 0;
  if (payload.endsWith('==')) padding = 2;
  else if (payload.endsWith('=')) padding = 1;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
};
