/** Uniform spatial hash, rebuilt every step. Keeps hundreds of enemies vs shots and the player cheap. */
export class Grid<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();
  constructor(private cell = 32) {}

  private key(cx: number, cy: number) {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  rebuild(items: readonly T[]) {
    for (const bucket of this.cells.values()) bucket.length = 0;
    for (const item of items) {
      const k = this.key(Math.floor(item.x / this.cell), Math.floor(item.y / this.cell));
      let bucket = this.cells.get(k);
      if (!bucket) this.cells.set(k, (bucket = []));
      bucket.push(item);
    }
  }

  /** Calls `visit` for every item whose cell is within `radius` of (x, y). Return true to stop early. */
  near(x: number, y: number, radius: number, visit: (item: T) => boolean | void) {
    const x0 = Math.floor((x - radius) / this.cell), x1 = Math.floor((x + radius) / this.cell);
    const y0 = Math.floor((y - radius) / this.cell), y1 = Math.floor((y + radius) / this.cell);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (bucket) for (const item of bucket) if (visit(item)) return;
      }
  }
}
