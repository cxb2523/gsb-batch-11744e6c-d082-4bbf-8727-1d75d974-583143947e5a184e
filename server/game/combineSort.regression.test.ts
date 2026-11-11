// Offline regression tests for the pure functions and response mappings behind
// POST /api/combine and POST /api/sort, plus the pure daily-challenge helpers.
// No database, network, secrets or Netlify runtime: pool queries go to a mock,
// transaction-client queries to a fake client, and Jev/budget calls are mocked.
import type pg from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SORT_MAX_ELEMENTS, type SortScore, type SortSpec } from "../../src/shared/api.ts";
import { Fizzled, type ElementProposal, type ScoreOutcome } from "../ai/index.ts";
import { BUDGETS } from "../ratelimit.ts";
import { computeStreak, resolveDay, tiersFor, type ChallengeRow } from "./challenges.ts";
import { CombineSchema, candidateCost, resolveElement, scoreDiscovery } from "./combine.ts";
import { scorable, toResponse } from "./sort.ts";

const m = vi.hoisted(() => ({
  hit: vi.fn(),
  scoreElements: vi.fn(),
  /** Pool queries (no client passed); queries on an explicit client go to the real q/q1. */
  db: vi.fn(),
}));

vi.mock("../ratelimit.ts", async (orig) => ({
  ...(await orig<typeof import("../ratelimit.ts")>()),
  hit: m.hit,
}));
vi.mock("../ai/index.ts", async (orig) => ({ ...(await orig<typeof import("../ai/index.ts")>()), scoreElements: m.scoreElements }));
vi.mock("../db.ts", async (orig) => {
  const real = await orig<typeof import("../db.ts")>();
  return {
    ...real,
    q: (text: string, params: unknown[] = [], client?: pg.PoolClient) => (client ? real.q(text, params, client) : m.db(text, params)),
    q1: async (text: string, params: unknown[] = [], client?: pg.PoolClient) =>
      client ? real.q1(text, params, client) : ((await m.db(text, params)) as unknown[])[0],
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  m.hit.mockResolvedValue({ ok: true });
});

// ------------------------------------------------------------------ scoreDiscovery

const rankSpec: SortSpec = { kind: "rank", prompt: "spookiest" };
const MUD = { id: "1083333177628557399", name: "Mud" };

describe("scoreDiscovery with a charged budget but no usable score", () => {
  it("returns undefined when Jev answers with retry instead of a score", async () => {
    m.scoreElements.mockResolvedValue({ engine: "test/rx", scored: new Map(), retry: [MUD.id], tokens: 3 } satisfies ScoreOutcome);
    expect(await scoreDiscovery(rankSpec, MUD)).toBeUndefined();
    // The budget was charged before Jev ran; the retry is the provider's answer, not a budget skip.
    expect(m.hit).toHaveBeenCalledWith([{ limit: BUDGETS.jev, subject: "all", cost: 1 }]);
    expect(m.scoreElements).toHaveBeenCalledTimes(1);
  });

  it("returns undefined when the scored map holds only some other element", async () => {
    m.scoreElements.mockResolvedValue({
      engine: "test/rx",
      scored: new Map([["1083333177628557000", { s: 900 }]]),
      retry: [],
      tokens: 3,
    } satisfies ScoreOutcome);
    expect(await scoreDiscovery(rankSpec, MUD)).toBeUndefined();
  });
});

// ------------------------------------------------------------------ candidateCost

describe("candidateCost", () => {
  it("counts each distinct ingredient once, however often it appears", () => {
    const water = { id: "1", depth: 0, steps: 0 };
    const earth = { id: "2", depth: 1, steps: 3 };
    expect(candidateCost([water, earth, water, earth, water])).toEqual({ depth: 2, steps: 4 });
    expect(candidateCost([water, water])).toEqual({ depth: 1, steps: 1 });
  });

  it("is wholly unknown when any distinct ingredient is unknown", () => {
    expect(candidateCost([{ id: "1", depth: 2, steps: 5 }, { id: "2", depth: null, steps: null }])).toEqual({
      depth: null,
      steps: null,
    });
    // A duplicated unknown is still one unknown: the result does not change with repetition.
    expect(candidateCost([{ id: "1", depth: null, steps: null }, { id: "1", depth: null, steps: null }])).toEqual({
      depth: null,
      steps: null,
    });
  });
});

// ------------------------------------------------------------------ resolveElement

const proposal: ElementProposal = {
  name: "Rain Forest",
  key: "rain forest",
  foldKey: "rain forest",
  emoji: "🌳",
  description: "A wet, green forest.",
  notable: false,
  artHint: null,
};

const row = (over: Record<string, unknown> = {}) => ({
  id: "1083333177628557313",
  name: "Rain Forest",
  emoji: "🌳",
  description: "A wet, green forest.",
  notable: false,
  depth: null,
  steps: null,
  is_starter: false,
  status: "quarantined",
  image_status: "none",
  image_key: null,
  discovered_by: "77",
  ...over,
});

/** A fake client: each handler answers the first query whose SQL matches its pattern. */
function fakeClient(handlers: [RegExp, (params: unknown[]) => unknown[] | Error][]) {
  const seen: string[] = [];
  const client = {
    query: async (text: string, params: unknown[] = []) => {
      seen.push(text);
      const h = handlers.find(([re]) => re.test(text));
      if (!h) throw new Error(`unexpected query: ${text}`);
      const out = h[1](params);
      if (out instanceof Error) throw out;
      return { rows: out };
    },
  };
  return { client: client as unknown as pg.PoolClient, seen };
}

const byKey = /WHERE e\.name_key = \$1/;
const revive = /SET status = 'active', quarantine_reason = NULL/;
const lower = /SET depth = CASE/;
const insert = /INSERT INTO \S+elements/;

describe("resolveElement depth/steps monotonicity", () => {
  it("lowers depth/steps on an active element when the new recipe is a shorter path", async () => {
    const { client, seen } = fakeClient([
      [byKey, () => [row({ status: "active", depth: 4, steps: 9 })]],
      [lower, (p) => {
        expect(p).toEqual(["1083333177628557313", 2, 5]);
        return [{ depth: 2, steps: 5 }];
      }],
    ]);
    const out = await resolveElement(client, proposal, { depth: 2, steps: 5 }, "99");
    expect(out.inserted).toBe(false);
    expect(out.element).toMatchObject({ id: "1083333177628557313", depth: 2, steps: 5, discovered_by: "77" });
    expect(seen.some((q) => revive.test(q) || insert.test(q))).toBe(false);
  });

  it("never raises depth/steps: a longer path leaves the active row untouched", async () => {
    const { client, seen } = fakeClient([
      [byKey, () => [row({ status: "active", depth: 2, steps: 3 })]],
      // The UPDATE's WHERE clause matches only when it would lower something, so it returns no row.
      [lower, (p) => {
        expect(p).toEqual(["1083333177628557313", 6, 10]);
        return [];
      }],
    ]);
    const out = await resolveElement(client, proposal, { depth: 6, steps: 10 }, "99");
    expect(out.inserted).toBe(false);
    expect(out.element).toMatchObject({ depth: 2, steps: 3 });
    expect(seen.some((q) => insert.test(q))).toBe(false);
  });
});

describe("resolveElement and quarantined names", () => {
  it("fizzles on a non-orphaned quarantined name without inserting or looking further", async () => {
    const { client, seen } = fakeClient([
      [byKey, () => [row({ status: "quarantined" })]],
      [revive, () => []], // the UPDATE matches only quarantine_reason 'orphaned'
    ]);
    await expect(resolveElement(client, proposal, { depth: 1, steps: 1 }, "99")).rejects.toBeInstanceOf(Fizzled);
    expect(seen.some((q) => revive.test(q) && /quarantine_reason = 'orphaned'/.test(q))).toBe(true); // it tried the orphan revive
    expect(seen.some((q) => insert.test(q))).toBe(false); // no INSERT for a quarantined name
    expect(seen.some((q) => lower.test(q) || /fold_key/.test(q))).toBe(false); // and no fall-through either
  });
});

// ------------------------------------------------------------------ CombineSchema

describe("CombineSchema resilience", () => {
  const base = { ids: ["1", "2"], clientDate: "2026-11-11" };

  it("parses with sort undefined when the spec is invalid, keeping ids and clientDate", () => {
    for (const sort of [{ kind: "rank", prompt: "" }, { kind: "groups", groups: ["Only"] }, null, 7]) {
      const parsed = CombineSchema.safeParse({ ...base, sort });
      expect(parsed.success).toBe(true);
      expect(parsed.data?.sort).toBeUndefined();
      expect(parsed.data?.ids).toEqual(["1", "2"]);
      expect(parsed.data?.clientDate).toBe("2026-11-11");
    }
  });

  it("fails as a whole when ids are fewer than 2 or more than the maximum, even with a bad sort", () => {
    const badSort = { kind: "rank", prompt: "" };
    expect(CombineSchema.safeParse({ ids: ["1"], clientDate: "2026-11-11", sort: badSort }).success).toBe(false);
    expect(CombineSchema.safeParse({ ids: [], clientDate: "2026-11-11" }).success).toBe(false);
    expect(CombineSchema.safeParse({ ids: ["1", "2", "3", "4", "5"], clientDate: "2026-11-11" }).success).toBe(false);
    expect(CombineSchema.safeParse({ ids: ["1", "not-an-id"], clientDate: "2026-11-11" }).success).toBe(false);
  });
});

// ------------------------------------------------------------------ scorable SQL

describe("scorable selection semantics", () => {
  it("asks the DB for owned, active elements only, with deduped ids as strings", async () => {
    m.db.mockResolvedValue([{ id: "7", name: "Fire" }]);
    const items = await scorable("42", ["7", "7", "8"]);
    expect(m.db).toHaveBeenCalledTimes(1);
    const [sql, params] = m.db.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("d.player_id = $1");
    expect(sql).toContain("d.element_id = ANY($2::INT8[])");
    expect(sql).toContain("e.status = 'active'");
    expect(sql).not.toMatch(/ORDER BY/);
    expect(params).toEqual(["42", ["7", "8"]]); // deduped, still strings
    // "8" came back from the DB unselected (unowned or quarantined): silently dropped, not an error.
    expect(items).toEqual([{ id: "7", name: "Fire" }]);
  });

  it("reads the whole library newest first, one row past SORT_MAX_ELEMENTS", async () => {
    m.db.mockResolvedValue([]);
    expect(await scorable("42")).toEqual([]);
    const [sql, params] = m.db.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("d.player_id = $1");
    expect(sql).toContain("e.status = 'active'");
    expect(sql).not.toContain("ANY(");
    expect(sql).toMatch(/ORDER BY d\.discovered_at DESC, e\.id\s+LIMIT \$2/);
    expect(params).toEqual(["42", SORT_MAX_ELEMENTS + 1]);
  });

  it("never coerces INT8 ids to numbers", async () => {
    m.db.mockResolvedValue([{ id: "1083333177628557313", name: "Big" }]);
    const [item] = await scorable("42", ["1083333177628557313"]);
    expect(item).toEqual({ id: "1083333177628557313", name: "Big" });
    expect(typeof item!.id).toBe("string");
  });
});

// ------------------------------------------------------------------ toResponse

const items = [
  { id: "1", name: "A" },
  { id: "2", name: "B" },
  { id: "3", name: "C" },
  { id: "4", name: "D" },
];
const outcome = (scored: Map<string, SortScore>): ScoreOutcome => ({ engine: "test/rx", scored, retry: [], tokens: 0 });
const twoGroups: SortSpec = { kind: "groups", groups: ["Animals", "Weather"] };

describe("toResponse", () => {
  it("rank: rounds and clamps scores into 0..1000 and never emits g/n", () => {
    const res = toResponse(
      rankSpec,
      outcome(
        new Map([
          ["1", { s: 1000.4 }],
          ["2", { s: -3 }],
          ["3", { s: 500.5 }],
          ["4", { s: 0.4 }],
        ]),
      ),
      items,
      false,
    );
    expect(res).toEqual({ engine: "test/rx", ids: ["1", "2", "3", "4"], s: [1000, 0, 501, 0], retry: [] });
    expect(res).not.toHaveProperty("g");
    expect(res).not.toHaveProperty("n");
    expect(res).not.toHaveProperty("truncated");
  });

  it("groups: out-of-range or fractional g and a missing n land in retry, not in ids/s", () => {
    const res = toResponse(
      twoGroups,
      outcome(
        new Map([
          ["1", { s: 700, g: 2, n: 900 }], // g == groups.length: out of range
          ["2", { s: 700, g: 1 }], // n missing
          ["3", { s: 700, g: -1, n: 100 }], // negative g
          ["4", { s: 700, g: 1, n: 1200.6 }], // valid; n is clamped
        ]),
      ),
      items,
      false,
    );
    expect(res.ids).toEqual(["4"]);
    expect(res.s).toEqual([700]);
    expect(res.g).toEqual([1]);
    expect(res.n).toEqual([1000]);
    expect(res.retry).toEqual(["1", "2", "3"]);
  });

  it("sends unscored and non-finite scores to retry in load order", () => {
    const res = toResponse(
      rankSpec,
      outcome(
        new Map([
          ["2", { s: Number.NaN }],
          ["4", { s: 250 }],
        ]),
      ),
      items,
      false,
    );
    expect(res.ids).toEqual(["4"]);
    expect(res.s).toEqual([250]);
    expect(res.retry).toEqual(["1", "2", "3"]);
  });

  it("carries the truncated key only when the library was actually cut", () => {
    const scored = outcome(new Map([["1", { s: 1 }]]));
    const cut = toResponse(rankSpec, scored, [items[0]!], true);
    expect(cut.truncated).toBe(true);
    const whole = toResponse(rankSpec, scored, [items[0]!], false);
    expect(whole).not.toHaveProperty("truncated");
  });
});

// ------------------------------------------------------------------ challenges

describe("resolveDay fallbacks", () => {
  const now = new Date("2026-11-11T06:00:00Z"); // plausible client days: 2026-11-10 and 2026-11-11

  it("falls back to UTC today for malformed or out-of-window client dates", () => {
    for (const bad of ["2026-13-01", "2026-11-1", "11/11/2026", "", "yesterday", "2026-11-09", "2026-11-12"]) {
      expect(resolveDay(bad, now)).toBe("2026-11-11");
    }
    expect(resolveDay(undefined, now)).toBe("2026-11-11");
  });

  it("accepts both boundary-plausible days verbatim", () => {
    expect(resolveDay("2026-11-10", now)).toBe("2026-11-10"); // still today behind UTC
    expect(resolveDay("2026-11-11", now)).toBe("2026-11-11");
  });
});

describe("computeStreak grace day", () => {
  it("keeps current when today is not done yet but yesterday is", () => {
    expect(computeStreak(["2026-11-08", "2026-11-09", "2026-11-10"], "2026-11-11")).toEqual({ current: 3, best: 3 });
    expect(computeStreak(["2026-11-10"], "2026-11-11")).toEqual({ current: 1, best: 1 });
  });

  it("zeroes current once yesterday is also missed, without touching best", () => {
    const days = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-09"];
    expect(computeStreak(days, "2026-11-11")).toEqual({ current: 0, best: 3 });
  });
});

describe("tiersFor", () => {
  const c: ChallengeRow = {
    day: "2026-11-11",
    easy_id: "5",
    hard_id: "5",
    expert_id: "9",
    easy_steps: null,
    hard_steps: null,
    expert_steps: null,
  };

  it("returns every matching tier in easy/hard/expert order", () => {
    expect(tiersFor(c, "5")).toEqual(["easy", "hard"]); // one element can be two tiers' target
    expect(tiersFor(c, "9")).toEqual(["expert"]);
  });

  it("returns nothing for a non-target element", () => {
    expect(tiersFor(c, "1")).toEqual([]);
    expect(tiersFor(c, "6")).toEqual([]);
  });
});
