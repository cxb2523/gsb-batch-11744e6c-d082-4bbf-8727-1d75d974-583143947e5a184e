declare module "redis" {
  export function createClient(options?: Record<string, unknown>): {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, options?: Record<string, unknown>): Promise<unknown>;
    del(key: string | string[]): Promise<number>;
    exists(key: string): Promise<number>;
    scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string | string[]>;
    quit(): Promise<unknown>;
    connect(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
  };
}
