declare module "@/lib/cosmoShip" {
  export interface ImageDataLike {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }

  export class FloatValue {
    constructor(value: number);
    value: number;
  }

  export class ColorValue {
    constructor(parts: [string, string, string, string]);
    parts: [string, string, string, string];
  }

  export class Ship {
    constructor(imageData: ImageDataLike);
    data: unknown;
    version: 1 | 2;
    encode(node: unknown, arr?: number[]): number[];
    write(): Promise<ImageDataLike>;
    static fromSource(
      source: File | Blob | string | HTMLImageElement
    ): Promise<Ship>;
  }

  export function imageDataToPngBlob(imageData: ImageDataLike): Promise<Blob>;
}
