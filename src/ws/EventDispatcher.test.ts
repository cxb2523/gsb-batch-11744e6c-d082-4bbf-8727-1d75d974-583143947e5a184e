import { describe, it, expect, vi } from "vitest";
import { EventDispatcher } from "./EventDispatcher.ts";

describe("EventDispatcher", () => {
  it("should register and emit events", () => {
    const dispatcher = new EventDispatcher();
    const callback = vi.fn();

    dispatcher.on("nodeReady", callback);
    dispatcher.emit("nodeReady", "node-1");

    expect(callback).toHaveBeenCalledWith("node-1");
  });

  it("should support once listeners", () => {
    const dispatcher = new EventDispatcher();
    const callback = vi.fn();

    dispatcher.once("nodeReady", callback);
    dispatcher.emit("nodeReady", "node-1");
    dispatcher.emit("nodeReady", "node-2");

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should remove listeners with off", () => {
    const dispatcher = new EventDispatcher();
    const callback = vi.fn();

    dispatcher.on("nodeReady", callback);
    dispatcher.off("nodeReady", callback);
    dispatcher.emit("nodeReady", "node-1");

    expect(callback).not.toHaveBeenCalled();
  });

  it("should remove all listeners for an event", () => {
    const dispatcher = new EventDispatcher();
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    dispatcher.on("nodeReady", callback1);
    dispatcher.on("nodeReady", callback2);
    dispatcher.off("nodeReady");
    dispatcher.emit("nodeReady", "node-1");

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).not.toHaveBeenCalled();
  });

  it("should handle multiple listeners", () => {
    const dispatcher = new EventDispatcher();
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    dispatcher.on("trackStart", callback1);
    dispatcher.on("trackStart", callback2);
    dispatcher.emit("trackStart", "guild-1", {
      encoded: "",
      info: {
        identifier: "",
        isSeekable: false,
        author: "",
        length: 0,
        isStream: false,
        position: 0,
        title: "",
        uri: null,
        artworkUrl: null,
        isrc: null,
        sourceName: "",
      },
      pluginInfo: {},
    });

    expect(callback1).toHaveBeenCalled();
    expect(callback2).toHaveBeenCalled();
  });

  it("should not throw when emitting with no listeners", () => {
    const dispatcher = new EventDispatcher();

    expect(() => {
      dispatcher.emit("nodeReady", "node-1");
    }).not.toThrow();
  });

  it("should handle listener count", () => {
    const dispatcher = new EventDispatcher();
    const cb = vi.fn();

    expect(dispatcher.listenerCount("nodeReady")).toBe(0);

    dispatcher.on("nodeReady", cb);
    expect(dispatcher.listenerCount("nodeReady")).toBe(1);

    dispatcher.off("nodeReady", cb);
    expect(dispatcher.listenerCount("nodeReady")).toBe(0);
  });

  it("should remove all listeners", () => {
    const dispatcher = new EventDispatcher();
    dispatcher.on("nodeReady", vi.fn());
    dispatcher.on("trackStart", vi.fn());

    dispatcher.removeAllListeners();

    expect(dispatcher.listenerCount("nodeReady")).toBe(0);
    expect(dispatcher.listenerCount("trackStart")).toBe(0);
  });

  it("should not break when a listener throws", () => {
    const dispatcher = new EventDispatcher();
    const throwing = vi.fn().mockImplementation(() => {
      throw new Error("oops");
    });
    const normal = vi.fn();

    dispatcher.on("nodeReady", throwing);
    dispatcher.on("nodeReady", normal);
    dispatcher.emit("nodeReady", "node-1");

    expect(throwing).toHaveBeenCalled();
    expect(normal).toHaveBeenCalled();
  });

  it("should not invoke listeners added during the same emit", () => {
    const dispatcher = new EventDispatcher();
    const addedDuringEmit = vi.fn();

    dispatcher.on("nodeReady", () => {
      dispatcher.on("nodeReady", addedDuringEmit);
    });
    dispatcher.emit("nodeReady", "node-1");

    expect(addedDuringEmit).not.toHaveBeenCalled();

    // ...but the listener IS registered for the next emit
    dispatcher.emit("nodeReady", "node-2");
    expect(addedDuringEmit).toHaveBeenCalledWith("node-2");
  });

  it("should still run once-listeners that are removed during the same emit", () => {
    const dispatcher = new EventDispatcher();
    const onceCb = vi.fn();

    dispatcher.once("nodeReady", onceCb);
    dispatcher.on("nodeReady", () => {
      dispatcher.off("nodeReady");
    });
    dispatcher.emit("nodeReady", "node-1");

    expect(onceCb).toHaveBeenCalledTimes(1);
    // "off" cleared the whole event — the once listener must not fire again
    dispatcher.emit("nodeReady", "node-2");
    expect(onceCb).toHaveBeenCalledTimes(1);
  });
});
