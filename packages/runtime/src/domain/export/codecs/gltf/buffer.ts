import { sanitizeNumber } from './primitives';

export class ByteWriter {
  private readonly bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  align4(): void {
    while (this.bytes.length % 4 !== 0) this.bytes.push(0);
  }

  append(data: Uint8Array): void {
    for (const byte of data) this.bytes.push(byte);
  }

  toUint8Array(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export const packFloat32 = (values: number[]): Uint8Array => {
  const buf = new ArrayBuffer(values.length * 4);
  const view = new DataView(buf);
  values.forEach((value, idx) => {
    view.setFloat32(idx * 4, sanitizeNumber(value), true);
  });
  return new Uint8Array(buf);
};

export const packUint16 = (values: number[]): Uint8Array => {
  const buf = new ArrayBuffer(values.length * 2);
  const view = new DataView(buf);
  values.forEach((value, idx) => {
    view.setUint16(idx * 2, Math.max(0, Math.min(65535, Math.floor(sanitizeNumber(value)))), true);
  });
  return new Uint8Array(buf);
};

export const encodeDataUri = (mime: string, bytes: Uint8Array): string =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
