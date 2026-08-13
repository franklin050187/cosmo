declare module "@/lib/cosmoShip" {
  export interface ImageDataLike {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }

  export class Ship {
    constructor(imageData: ImageDataLike);
    data: unknown;
    write(): Promise<ImageDataLike>;
    static fromSource(
      source: File | Blob | string | HTMLImageElement
    ): Promise<Ship>;
  }

  export function imageDataToPngBlob(imageData: ImageDataLike): Promise<Blob>;
}
