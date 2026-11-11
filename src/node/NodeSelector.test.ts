import { describe, it, expect } from "vitest";
import {
  LeastUsedSelector,
  LeastPenaltySelector,
  CpuUsageSelector,
  MemoryUsageSelector,
  LowestPingSelector,
  RoundRobinSelector,
  RandomSelector,
  CustomSelector,
} from "./NodeSelector.ts";
import { Node } from "./Node.ts";
import type { NodeConfig } from "../types/internal.ts";

function createNode(config: Partial<NodeConfig> = {}): Node {
  return new Node(
    {
      host: "localhost",
      port: 2333,
      password: "youshallnotpass",
      name: "test-node",
      ...config,
    },
    "123456",
  );
}

describe("NodeSelector", () => {
  describe("LeastUsedSelector", () => {
    it("should pick node with fewest players", () => {
      const selector = new LeastUsedSelector();
      const node1 = createNode({ name: "node-1" });
      const node2 = createNode({ name: "node-2" });
      const node3 = createNode({ name: "node-3" });

      Object.defineProperty(node1, "state", { value: "connected" });
      Object.defineProperty(node2, "state", { value: "connected" });
      Object.defineProperty(node3, "state", { value: "connected" });

      node1.playerCount = 5;
      node2.playerCount = 2;
      node3.playerCount = 10;

      const result = selector.pick([node1, node2, node3], "guild-1");
      expect(result).toBe(node2);
    });

    it("should return null if no connected nodes", () => {
      const selector = new LeastUsedSelector();
      const node = createNode();
      Object.defineProperty(node, "state", { value: "disconnected" });

      expect(selector.pick([node], "guild-1")).toBeNull();
    });

    it("should return null for empty array", () => {
      const selector = new LeastUsedSelector();
      expect(selector.pick([], "guild-1")).toBeNull();
    });
  });

  describe("LeastPenaltySelector", () => {
    it("should pick node with lowest penalty", () => {
      const selector = new LeastPenaltySelector();
      const node1 = createNode({ name: "node-1" });
      const node2 = createNode({ name: "node-2" });

      Object.defineProperty(node1, "state", { value: "connected" });
      Object.defineProperty(node2, "state", { value: "connected" });
      Object.defineProperty(node1, "penalties", {
        get: () => ({ total: 100, playerPenalty: 50, cpuPenalty: 30, deficitPenalty: 10, nullPenalty: 10 }),
        configurable: true,
      });
      Object.defineProperty(node2, "penalties", {
        get: () => ({ total: 50, playerPenalty: 20, cpuPenalty: 15, deficitPenalty: 10, nullPenalty: 5 }),
        configurable: true,
      });

      const result = selector.pick([node1, node2], "guild-1");
      expect(result).toBe(node2);
    });
  });

  describe("CpuUsageSelector", () => {
    it("should pick node with lowest CPU load", () => {
      const selector = new CpuUsageSelector();
      const node1 = createNode({ name: "node-1" });
      const node2 = createNode({ name: "node-2" });
      Object.defineProperty(node1, "state", { value: "connected" });
      Object.defineProperty(node2, "state", { value: "connected" });

      Object.defineProperty(node1, "stats", {
        value: {
          players: 0,
          playingPlayers: 0,
          uptime: 0,
          memory: { free: 0, used: 0, allocated: 0, reservable: 0 },
          cpu: { cores: 4, systemLoad: 0.5, lavalinkLoad: 0.8 },
          frameStats: null,
        },
      });
      Object.defineProperty(node2, "stats", {
        value: {
          players: 0,
          playingPlayers: 0,
          uptime: 0,
          memory: { free: 0, used: 0, allocated: 0, reservable: 0 },
          cpu: { cores: 4, systemLoad: 0.2, lavalinkLoad: 0.1 },
          frameStats: null,
        },
      });

      const result = selector.pick([node1, node2], "guild-1");
      expect(result).toBe(node2);
    });
  });

  describe("MemoryUsageSelector", () => {
    it("should pick node with lowest memory usage", () => {
      const selector = new MemoryUsageSelector();
      const node1 = createNode({ name: "node-1" });
      const node2 = createNode({ name: "node-2" });
      Object.defineProperty(node1, "state", { value: "connected" });
      Object.defineProperty(node2, "state", { value: "connected" });

      Object.defineProperty(node1, "stats", {
        value: {
          players: 0,
          playingPlayers: 0,
          uptime: 0,
          memory: { free: 100, used: 800, allocated: 1000, reservable: 1000 },
          cpu: { cores: 4, systemLoad: 0, lavalinkLoad: 0 },
          frameStats: null,
        },
      });
      Object.defineProperty(node2, "stats", {
        value: {
          players: 0,
          playingPlayers: 0,
          uptime: 0,
          memory: { free: 800, used: 200, allocated: 1000, reservable: 1000 },
          cpu: { cores: 4, systemLoad: 0, lavalinkLoad: 0 },
          frameStats: null,
        },
      });

      const result = selector.pick([node1, node2], "guild-1");
      expect(result).toBe(node2);
    });
  });

  describe("LowestPingSelector", () => {
    it("should pick node with lowest ping", () => {
      const selector = new LowestPingSelector();
      const node1 = createNode({ name: "node-1" });
      const node2 = createNode({ name: "node-2" });
      Object.defineProperty(node1, "state", { value: "connected" });
      Object.defineProperty(node2, "state", { value: "connected" });

      Object.defineProperty(node1, "ping", { value: 120 });
      Object.defineProperty(node2, "ping", { value: 15 });

      const result = selector.pick([node1, node2], "guild-1");
      expect(result).toBe(node2);
    });
  });

  describe("CustomSelector", () => {
    it("should execute custom picker function", () => {
      const node1 = createNode({ name: "node-1" });
      const node2 = createNode({ name: "node-2" });
      Object.defineProperty(node1, "state", { value: "connected" });
      Object.defineProperty(node2, "state", { value: "connected" });

      const selector = new CustomSelector((nodes) => nodes.find((n) => n.id === "node-2") ?? null);
      expect(selector.pick([node1, node2], "guild-1")).toBe(node2);
    });
  });

  describe("RoundRobinSelector", () => {
    it("should cycle through nodes", () => {
      const selector = new RoundRobinSelector();
      const node1 = createNode({ name: "node-1" });
      const node2 = createNode({ name: "node-2" });
      const node3 = createNode({ name: "node-3" });

      Object.defineProperty(node1, "state", { value: "connected" });
      Object.defineProperty(node2, "state", { value: "connected" });
      Object.defineProperty(node3, "state", { value: "connected" });

      expect(selector.pick([node1, node2, node3], "guild-1")).toBe(node1);
      expect(selector.pick([node1, node2, node3], "guild-1")).toBe(node2);
      expect(selector.pick([node1, node2, node3], "guild-1")).toBe(node3);
      expect(selector.pick([node1, node2, node3], "guild-1")).toBe(node1);
    });

    it("should reset index", () => {
      const selector = new RoundRobinSelector();
      const node1 = createNode({ name: "node-1" });
      const node2 = createNode({ name: "node-2" });

      Object.defineProperty(node1, "state", { value: "connected" });
      Object.defineProperty(node2, "state", { value: "connected" });

      selector.pick([node1, node2], "guild-1");
      selector.reset();
      expect(selector.pick([node1, node2], "guild-1")).toBe(node1);
    });
  });

  describe("RandomSelector", () => {
    it("should return a connected node", () => {
      const selector = new RandomSelector();
      const node = createNode();
      Object.defineProperty(node, "state", { value: "connected" });

      const result = selector.pick([node], "guild-1");
      expect(result).toBe(node);
    });

    it("should return null for empty array", () => {
      const selector = new RandomSelector();
      expect(selector.pick([], "guild-1")).toBeNull();
    });
  });
});
