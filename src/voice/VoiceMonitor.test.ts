import { describe, it, expect, vi } from "vitest";
import { Player } from "../player/Player.ts";

describe("Voice Monitor & 24/7 Mode", () => {
  it("should configure stayInVc mode", () => {
    const mockKumo: any = { sendGatewayPayload: vi.fn() };
    const mockNode: any = { ws: { eventDispatcher: { on: vi.fn(), off: vi.fn() } } };

    const player = new Player({
      guildId: "123",
      node: mockNode,
      voiceChannelId: "456",
      kumo: mockKumo,
      stayInVc: true,
    });

    expect(player.stayInVc).toBe(true);
    player.setStayInVc(false);
    expect(player.stayInVc).toBe(false);
  });

  it("should handle empty VC timeout and emit events", async () => {
    vi.useFakeTimers();
    const mockKumo: any = { sendGatewayPayload: vi.fn() };
    const mockNode: any = {
      ws: { eventDispatcher: { on: vi.fn(), off: vi.fn() } },
      rest: { destroyPlayer: vi.fn().mockResolvedValue(undefined) },
    };

    const player = new Player({
      guildId: "123",
      node: mockNode,
      voiceChannelId: "456",
      kumo: mockKumo,
      emptyVcTimeoutMs: 1000,
    });

    const autoDisconnectListener = vi.fn();
    player.on("playerAutoDisconnected", autoDisconnectListener);

    // VC becomes empty (only bot or 0 members left)
    player.setVcMemberCount(1);
    expect(autoDisconnectListener).not.toHaveBeenCalled();

    // Fast-forward timers
    vi.advanceTimersByTime(1000);
    expect(autoDisconnectListener).toHaveBeenCalledWith("123");
    expect(player.destroyed).toBe(true);

    vi.useRealTimers();
  });
});
