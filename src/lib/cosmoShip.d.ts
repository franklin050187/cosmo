declare module "@/lib/cosmoShip" {
  export class Ship {
    data: unknown;
    static fromSource(
      source: File | Blob | string | HTMLImageElement
    ): Promise<Ship>;
  }
}
