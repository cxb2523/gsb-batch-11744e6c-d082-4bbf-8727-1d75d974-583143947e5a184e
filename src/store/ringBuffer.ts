/**
 * Pure fixed-capacity Ring Buffer for high-throughput streaming (e.g. 10,000 log lines).
 * Memory efficient: uses pre-allocated circular buffer without shifting array memory.
 */
export class RingBuffer<T> {
  private buffer: Array<T | undefined>;
  private head = 0;
  private count = 0;
  public readonly capacity: number;

  constructor(capacity = 10000) {
    if (capacity <= 0) throw new Error('RingBuffer capacity must be > 0');
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  public push(item: T): void {
    const idx = (this.head + this.count) % this.capacity;
    this.buffer[idx] = item;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  public pushBatch(items: T[]): void {
    for (let i = 0; i < items.length; i++) {
      this.push(items[i]);
    }
  }

  public get size(): number {
    return this.count;
  }

  public get length(): number {
    return this.count;
  }

  public get(index: number): T | undefined {
    if (index < 0 || index >= this.count) return undefined;
    const actualIdx = (this.head + index) % this.capacity;
    return this.buffer[actualIdx];
  }

  public toArray(): T[] {
    const result: T[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      result[i] = this.buffer[(this.head + i) % this.capacity] as T;
    }
    return result;
  }

  public clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
  }
}
