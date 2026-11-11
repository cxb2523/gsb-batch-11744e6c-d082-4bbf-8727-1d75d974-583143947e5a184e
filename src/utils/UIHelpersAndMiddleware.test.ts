import { describe, it, expect, vi } from "vitest";
import { formatDuration, getProgressBar, createQueueEmbedData } from "./UIHelpers.ts";
import { MiddlewareRegistry } from "./Middleware.ts";

describe("UIHelpers", () => {
  it("should format duration correctly", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65000)).toBe("1:05");
    expect(formatDuration(3665000)).toBe("1:01:05");
  });

  it("should generate progress bar", () => {
    const bar = getProgressBar(50, 100, { size: 10 });
    expect(bar).toContain("🔘");
    expect(bar.length).toBeGreaterThan(5);
  });

  it("should create queue embed data", () => {
    const tracks = [
      { info: { title: "Track 1", length: 120000 } },
      { info: { title: "Track 2", length: 180000 } },
    ];
    const current = { info: { title: "Playing Track", length: 200000 } };

    const embedData = createQueueEmbedData(tracks, current, 1, 10);
    expect(embedData.title).toBe("Queue (Page 1/1)");
    expect(embedData.description).toContain("Playing Track");
    expect(embedData.description).toContain("Track 1");
  });
});

describe("MiddlewareRegistry", () => {
  it("should execute handlers and allow or block playback", async () => {
    const middleware = new MiddlewareRegistry();
    const mockTrack: any = { info: { title: "Test Track" } };

    expect(await middleware.runBeforeTrackStart("123", mockTrack)).toBe(true);

    const blocker = vi.fn().mockResolvedValue(false);
    middleware.useBeforeTrackStart(blocker);

    expect(await middleware.runBeforeTrackStart("123", mockTrack)).toBe(false);
    expect(blocker).toHaveBeenCalledWith("123", mockTrack);
  });
});
