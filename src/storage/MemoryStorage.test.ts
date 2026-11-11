import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage } from "./MemoryStorage.ts";

describe("MemoryStorage", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("should set and get values", async () => {
    await storage.set("key1", "value1");
    const value = await storage.get("key1");
    expect(value).toBe("value1");
  });

  it("should return null for missing keys", async () => {
    const value = await storage.get("noop");
    expect(value).toBeNull();
  });

  it("should store various data types", async () => {
    const obj = { foo: "bar", num: 42 };
    await storage.set("obj", obj);
    expect(await storage.get("obj")).toEqual(obj);

    await storage.set("num", 123);
    expect(await storage.get("num")).toBe(123);

    await storage.set("bool", true);
    expect(await storage.get("bool")).toBe(true);
  });

  it("should check key existence", async () => {
    expect(await storage.has("key1")).toBe(false);
    await storage.set("key1", "value1");
    expect(await storage.has("key1")).toBe(true);
  });

  it("should delete values", async () => {
    await storage.set("key1", "value1");
    expect(await storage.delete("key1")).toBe(true);
    expect(await storage.get("key1")).toBeNull();
  });

  it("should return false when deleting non-existent key", async () => {
    expect(await storage.delete("noop")).toBe(false);
  });

  it("should clear all values", async () => {
    await storage.set("key1", "value1");
    await storage.set("key2", "value2");
    await storage.clear();

    expect(await storage.get("key1")).toBeNull();
    expect(await storage.get("key2")).toBeNull();
    expect(storage.size).toBe(0);
  });

  it("should track size", async () => {
    expect(storage.size).toBe(0);
    await storage.set("key1", "v1");
    expect(storage.size).toBe(1);
    await storage.set("key2", "v2");
    expect(storage.size).toBe(2);
    await storage.delete("key1");
    expect(storage.size).toBe(1);
  });

  it("should handle null storage value", async () => {
    await storage.set("null", null);
    expect(await storage.get("null")).toBeNull();
  });
});
