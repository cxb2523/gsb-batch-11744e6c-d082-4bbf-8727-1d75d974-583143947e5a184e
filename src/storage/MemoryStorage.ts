import type { StorageAdapter } from "../types/internal.ts";

export class MemoryStorage implements StorageAdapter {
  private readonly store = new Map<string, unknown>();

  public async get(key: string): Promise<unknown | null> {
    const value = this.store.get(key);
    return value !== undefined ? value : null;
  }

  public async set(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }

  public async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  public async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  public async clear(): Promise<void> {
    this.store.clear();
  }

  public get size(): number {
    return this.store.size;
  }
}
