import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VoiceStateTracker } from "./VoiceStateTracker.ts";
import { EventDispatcher } from "../ws/EventDispatcher.ts";

describe("VoiceStateTracker", () => {
  let events: EventDispatcher;
  let tracker: VoiceStateTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    events = new EventDispatcher();
    tracker = new VoiceStateTracker(events);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("handleVoiceStateUpdate", () => {
    it("should create state on first update", () => {
      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: "vc-1",
        userId: "user-1",
      });

      const state = tracker.getState("guild-1");
      expect(state).toBeDefined();
      expect(state!.sessionId).toBe("session-1");
      expect(state!.channelId).toBe("vc-1");
      expect(state!.connected).toBe(false);
    });

    it("should disconnect when channelId is null", () => {
      const handler = vi.fn();
      events.on("voiceDisconnected", handler);

      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: "vc-1",
        userId: "user-1",
      });

      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: null,
        userId: "user-1",
      });

      expect(tracker.getState("guild-1")).toBeUndefined();
      expect(handler).toHaveBeenCalledWith("guild-1");
    });

    it("should detect session changes and emit reconnecting", () => {
      const reconnectingHandler = vi.fn();
      events.on("voiceReconnecting", reconnectingHandler);

      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: "vc-1",
        userId: "user-1",
      });

      tracker.handleVoiceServerUpdate("guild-1", {
        token: "token-1",
        endpoint: "wss://example.com",
      });

      vi.advanceTimersByTime(100);

      // Now send a new session
      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-2",
        channelId: "vc-1",
        userId: "user-1",
      });

      const state = tracker.getState("guild-1");
      expect(state!.sessionId).toBe("session-2");
      expect(state!.endpoint).toBeNull();
      expect(state!.token).toBeNull();
      expect(state!.reconnecting).toBe(true);
      expect(reconnectingHandler).toHaveBeenCalledWith("guild-1");
    });
  });

  describe("handleVoiceServerUpdate", () => {
    it("should store endpoint and token", () => {
      tracker.handleVoiceServerUpdate("guild-1", {
        token: "token-1",
        endpoint: "wss://example.com",
      });

      const state = tracker.getState("guild-1");
      expect(state).toBeDefined();
      expect(state!.endpoint).toBe("wss://example.com");
      expect(state!.token).toBe("token-1");
    });
  });

  describe("debouncing", () => {
    it("should not emit ready until both updates are received and debounce elapses", () => {
      const readyHandler = vi.fn();
      events.on("voiceReady", readyHandler);

      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: "vc-1",
        userId: "user-1",
      });

      // Not ready yet (no endpoint/token)
      vi.advanceTimersByTime(100);
      expect(readyHandler).not.toHaveBeenCalled();

      tracker.handleVoiceServerUpdate("guild-1", {
        token: "token-1",
        endpoint: "wss://example.com",
      });

      // Still not ready until debounce elapses
      expect(readyHandler).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(readyHandler).toHaveBeenCalledWith("guild-1");
    });

    it("should reset debounce timer if updates arrive close together", () => {
      const readyHandler = vi.fn();
      events.on("voiceReady", readyHandler);

      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: "vc-1",
        userId: "user-1",
      });

      tracker.handleVoiceServerUpdate("guild-1", {
        token: "token-1",
        endpoint: "wss://example.com",
      });

      // Another update comes in before debounce
      vi.advanceTimersByTime(30);

      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: "vc-2",
        userId: "user-1",
      });

      // Timer was reset, so emit hasn't fired yet
      expect(readyHandler).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(readyHandler).toHaveBeenCalledWith("guild-1");
    });
  });

  describe("isReady", () => {
    it("should return false when no state exists", () => {
      expect(tracker.isReady("guild-1")).toBe(false);
    });

    it("should return false when only sessionId is present", () => {
      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: "vc-1",
        userId: "user-1",
      });

      expect(tracker.isReady("guild-1")).toBe(false);
    });

    it("should return true when both session and server data arrive and debounce elapses", () => {
      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: "vc-1",
        userId: "user-1",
      });

      tracker.handleVoiceServerUpdate("guild-1", {
        token: "token-1",
        endpoint: "wss://example.com",
      });

      vi.advanceTimersByTime(100);

      expect(tracker.isReady("guild-1")).toBe(true);
    });
  });

  describe("getVoiceState", () => {
    it("should return null for unknown guild", () => {
      expect(tracker.getVoiceState("guild-1")).toBeNull();
    });

    it("should return InternalVoiceState for known guild", () => {
      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: "vc-1",
        userId: "user-1",
      });

      const state = tracker.getVoiceState("guild-1");
      expect(state).toEqual({
        sessionId: "session-1",
        channelId: "vc-1",
        endpoint: null,
        token: null,
      });
    });
  });

  describe("remove", () => {
    it("should remove state for a guild", () => {
      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: "vc-1",
        userId: "user-1",
      });

      tracker.remove("guild-1");
      expect(tracker.getState("guild-1")).toBeUndefined();
    });

    it("should clear debounce timer on remove", () => {
      const clearSpy = vi.spyOn(globalThis, "clearTimeout");

      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: "vc-1",
        userId: "user-1",
      });

      tracker.remove("guild-1");

      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });
  });

  describe("getAll", () => {
    it("should return all tracked states", () => {
      tracker.handleVoiceStateUpdate({
        guildId: "guild-1",
        sessionId: "session-1",
        channelId: "vc-1",
        userId: "user-1",
      });

      tracker.handleVoiceStateUpdate({
        guildId: "guild-2",
        sessionId: "session-2",
        channelId: "vc-2",
        userId: "user-2",
      });

      expect(tracker.getAll()).toHaveLength(2);
    });
  });
});
