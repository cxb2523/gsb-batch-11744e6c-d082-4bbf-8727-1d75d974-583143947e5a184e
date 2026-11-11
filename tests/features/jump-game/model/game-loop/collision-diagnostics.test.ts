import { BOSS_GAME_OVER_ICON } from '@/features/jump-game/model/config/assets';
import {
  DEFAULT_OBSTACLE_HITBOX_SCALE,
  OBSTACLE_PLAYER_PROXIMITY_CHECK_PX,
} from '@/features/jump-game/model/config/game-loop';
import {
  BOSS_PATTERN_TWO_MIN_SPAWN_INTERVAL_MS,
  BOSS_PATTERN_TWO_OBSTACLE_RATE,
  BOSS_PATTERN_TWO_SPAWN_INTERVAL_FACTOR,
  CLEAR_DURATION_MS,
  CROSS_ENTITY_SPAWN_SEPARATION_MS,
} from '@/features/jump-game/model/config/scene-spawn';
import { OBSTACLES_DEADLINE } from '@/features/jump-game/model/config/gameplay';
import { updateObstaclesFrame } from '@/features/jump-game/model/game-loop/obstacles';
import {
  diagnoseCollisionsAndSpawns,
  type CollisionDiagnosticsSnapshot,
  type DiagnosticsRect,
  type ObstacleSnapshot,
} from '@/features/jump-game/model/game-loop/collision-diagnostics';

type RectInit = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const createRect = ({ left, top, width, height }: RectInit): DiagnosticsRect => ({
  left,
  right: left + width,
  top,
  bottom: top + height,
  width,
  height,
});

const createDomRect = (rect: DiagnosticsRect): DOMRect =>
  ({
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  }) as DOMRect;

/**
 * Builds a jsdom element whose dataset mirrors the snapshot, so the real
 * `updateObstaclesFrame` can consume the same input as the diagnostics module.
 */
const createElementFromSnapshot = (
  snapshot: ObstacleSnapshot,
  liveRect?: DiagnosticsRect,
): HTMLElement => {
  const element = document.createElement('img');
  // Zero-speed frame keeps currentLeftPx equal to spawnLeftPx.
  element.dataset.spawnLeftPx = `${snapshot.currentLeftPx}`;
  if (snapshot.entityType !== undefined && snapshot.entityType !== null) {
    element.dataset.entityType = snapshot.entityType;
  }
  if (snapshot.gameOverIcon !== undefined && snapshot.gameOverIcon !== null) {
    element.dataset.gameOverIcon = snapshot.gameOverIcon;
  }
  if (snapshot.hitboxScale !== undefined && snapshot.hitboxScale !== null) {
    element.dataset.hitboxScale = `${snapshot.hitboxScale}`;
  }
  if (snapshot.entityWidthPx !== undefined && snapshot.entityWidthPx !== null) {
    element.dataset.entityWidthPx = `${snapshot.entityWidthPx}`;
  }
  if (snapshot.entityHeightPx !== undefined && snapshot.entityHeightPx !== null) {
    element.dataset.entityHeightPx = `${snapshot.entityHeightPx}`;
  }
  if (snapshot.entityBottomPx !== undefined && snapshot.entityBottomPx !== null) {
    element.dataset.entityBottomPx = `${snapshot.entityBottomPx}`;
  }
  if (liveRect) {
    element.getBoundingClientRect = () => createDomRect(liveRect);
  }
  return element;
};

type RuntimeFrameResult = {
  fatalIcon: string | null | undefined;
  remainingCount: number;
  removedCount: number;
  fishCollectedCount: number;
};

const runRealObstacleFrame = (
  snapshots: ObstacleSnapshot[],
  viewport: DiagnosticsRect,
  player: DiagnosticsRect,
  isBossVisible: boolean,
  liveRects: Map<number, DiagnosticsRect> = new Map(),
): RuntimeFrameResult => {
  const elements = snapshots.map((snapshot, index) =>
    createElementFromSnapshot(snapshot, liveRects.get(index)),
  );
  const obstaclesRef = { current: elements } as React.MutableRefObject<HTMLElement[]>;
  let fishCollectedCount = 0;

  const fatalIcon = updateObstaclesFrame({
    clearRequested: false,
    obstacleSpeedPxPerSec: 0,
    deltaTimeMs: 16,
    obstaclesRef,
    playerRef: { current: document.createElement('div') } as React.RefObject<HTMLDivElement | null>,
    getGameWidth: () => viewport.width,
    getPlayerRect: () => createDomRect(player),
    getGameRect: () => createDomRect(viewport),
    isBossVisible,
    onFishCollected: () => {
      fishCollectedCount += 1;
    },
  });

  const remainingCount = obstaclesRef.current.length;
  return {
    fatalIcon,
    remainingCount,
    removedCount: elements.length - remainingCount,
    fishCollectedCount,
  };
};

const baseSpawnParams = {
  obstacleSpawnInterval: 1500,
  normalSpawnRate: 0.98,
  bossPatternTwoActive: false,
  bossVisible: false,
  msSinceLastObstacleSpawn: 2000,
  msSinceLastFishSpawn: 1000,
  fishSpawnedCount: 2,
  fishSpawnTarget: 20,
  elapsedSinceStartMs: 5000,
  obstacleRandomRoll: 0.5,
  nextFishSpawnDueElapsedMs: 4000,
};

describe('diagnoseCollisionsAndSpawns', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies fish/fatal/out-of-bounds obstacles identically to updateObstaclesFrame and passes every check', () => {
    const viewport = createRect({ left: 100, top: 0, width: 1000, height: 400 });
    const player = createRect({ left: 400, top: 320, width: 40, height: 60 });

    const snapshots: ObstacleSnapshot[] = [
      // Fish overlapping the player: collected, never fatal.
      {
        entityType: 'fish',
        hitboxScale: 0.8,
        entityWidthPx: 30,
        entityHeightPx: 30,
        entityBottomPx: 40,
        currentLeftPx: 285,
      },
      // Past the deadline: removed before collision work.
      {
        entityType: 'chair',
        hitboxScale: 1,
        entityWidthPx: 50,
        entityHeightPx: 50,
        entityBottomPx: 0,
        currentLeftPx: OBSTACLES_DEADLINE - 1,
        gameOverIcon: '/assets/icons/chair-fault.svg',
      },
      // Far away: outside proximity window, untouched.
      {
        entityType: 'lamp',
        hitboxScale: 1,
        entityWidthPx: 40,
        entityHeightPx: 70,
        entityBottomPx: 0,
        currentLeftPx: 990,
        gameOverIcon: '/assets/icons/lamp-fault.svg',
      },
      // Fatal desk overlapping the player (last so the runtime filter reaches the fish first).
      {
        entityType: 'desk',
        hitboxScale: 0.75,
        entityWidthPx: 60,
        entityHeightPx: 80,
        entityBottomPx: 0,
        currentLeftPx: 260,
        gameOverIcon: '/assets/icons/desk-fault.svg',
      },
    ];

    const snapshot: CollisionDiagnosticsSnapshot = {
      viewport,
      playerRect: player,
      obstacles: snapshots,
      spawn: { ...baseSpawnParams },
    };

    const runtime = runRealObstacleFrame(snapshots, viewport, player, false);
    const result = diagnoseCollisionsAndSpawns(snapshot);

    // Runtime expectations: fish + desk removed, deadline entity removed, far one kept.
    expect(runtime.fatalIcon).toBe('/assets/icons/desk-fault.svg');
    expect(runtime.fishCollectedCount).toBe(1);
    expect(runtime.removedCount).toBe(3);
    expect(runtime.remainingCount).toBe(1);

    expect(result.degraded).toBe(false);
    expect(result.degradationReasons).toEqual([]);
    expect(result.checks.every((check) => check.passed)).toBe(true);

    const [fish, deadline, far, desk] = result.obstacles;

    // Classifications mirror runtime behavior.
    expect(fish.classification).toBe('fish-collected');
    expect(fish.wouldRemove).toBe(true);
    expect(fish.fatalIcon).toBeNull();
    expect(fish.overlapsPlayer).toBe(true);

    expect(desk.classification).toBe('fatal-collision');
    expect(desk.wouldRemove).toBe(true);
    expect(desk.fatalIcon).toBe('/assets/icons/desk-fault.svg');
    expect(desk.overlapsPlayer).toBe(true);

    expect(deadline.classification).toBe('out-of-bounds-removed');
    expect(deadline.wouldRemove).toBe(true);
    expect(deadline.hitbox).toBeNull();

    expect(far.classification).toBe('no-collision');
    expect(far.wouldRemove).toBe(false);
    expect(far.overlapsPlayer).toBe(false);

    // Independently recompute expected hitboxes with the source-code formulas.
    const expectedFishRect = {
      left: viewport.left + 285,
      top: viewport.bottom - 40 - 30,
      width: 30,
      height: 30,
    };
    const expectedFishHitbox = {
      left: expectedFishRect.left + (30 * (1 - 0.8)) / 2,
      right: expectedFishRect.left + 30 - (30 * (1 - 0.8)) / 2,
      top: expectedFishRect.top + (30 * (1 - 0.8)) / 2,
      bottom: expectedFishRect.top + 30 - (30 * (1 - 0.8)) / 2,
    };
    expect(fish.hitbox).toMatchObject(expectedFishHitbox);
    expect(fish.rectSource).toBe('cached-layout');

    const expectedDeskRect = {
      left: viewport.left + 260,
      top: viewport.bottom - 0 - 80,
      width: 60,
      height: 80,
    };
    const expectedDeskHitbox = {
      left: expectedDeskRect.left + (60 * (1 - 0.75)) / 2,
      right: expectedDeskRect.left + 60 - (60 * (1 - 0.75)) / 2,
      top: expectedDeskRect.top + (80 * (1 - 0.75)) / 2,
      bottom: expectedDeskRect.top + 80 - (80 * (1 - 0.75)) / 2,
    };
    expect(desk.hitbox).toMatchObject(expectedDeskHitbox);

    // Proximity boundary matches OBSTACLE_PLAYER_PROXIMITY_CHECK_PX semantics.
    expect(far.withinProximityCheckRange).toBe(
      990 < viewport.width - OBSTACLE_PLAYER_PROXIMITY_CHECK_PX,
    );
  });

  it('emits the boss fault icon for a fatal obstacle while the boss is visible, matching runtime', () => {
    const viewport = createRect({ left: 0, top: 0, width: 800, height: 300 });
    const player = createRect({ left: 200, top: 240, width: 40, height: 60 });
    const snapshots: ObstacleSnapshot[] = [
      {
        entityType: 'desk',
        hitboxScale: 1,
        entityWidthPx: 50,
        entityHeightPx: 60,
        entityBottomPx: 0,
        currentLeftPx: 210,
        gameOverIcon: '/assets/icons/desk-fault.svg',
      },
    ];

    const runtime = runRealObstacleFrame(snapshots, viewport, player, true);
    const result = diagnoseCollisionsAndSpawns({
      viewport,
      playerRect: player,
      obstacles: snapshots,
      spawn: { ...baseSpawnParams, bossVisible: true },
    });

    expect(runtime.fatalIcon).toBe(BOSS_GAME_OVER_ICON);
    expect(result.obstacles[0].classification).toBe('fatal-collision');
    expect(result.obstacles[0].fatalIcon).toBe(BOSS_GAME_OVER_ICON);
  });

  it('falls back to DEFAULT_OBSTACLE_HITBOX_SCALE when hitboxScale is absent', () => {
    const viewport = createRect({ left: 0, top: 0, width: 800, height: 300 });
    const player = createRect({ left: 100, top: 240, width: 40, height: 60 });
    const snapshots: ObstacleSnapshot[] = [
      {
        entityType: 'desk',
        entityWidthPx: 40,
        entityHeightPx: 40,
        entityBottomPx: 0,
        currentLeftPx: 110,
        gameOverIcon: '/assets/icons/desk-fault.svg',
      },
    ];

    const runtime = runRealObstacleFrame(snapshots, viewport, player, false);
    const result = diagnoseCollisionsAndSpawns({
      viewport,
      playerRect: player,
      obstacles: snapshots,
      spawn: { ...baseSpawnParams },
    });

    const diagnostic = result.obstacles[0];
    expect(diagnostic.hitboxScaleFellBackToDefault).toBe(true);
    expect(diagnostic.appliedHitboxScale).toBe(DEFAULT_OBSTACLE_HITBOX_SCALE);
    expect(
      result.checks.find((check) => check.name.includes('hitboxScale falls back')),
    ).toMatchObject({ passed: true });
    // Scale of 1 means hitbox equals the reconstructed rect.
    expect(diagnostic.hitbox).toMatchObject({
      left: viewport.left + 110,
      right: viewport.left + 150,
      top: viewport.bottom - 40,
      bottom: viewport.bottom,
    });
    // Runtime agrees on the fatal collision with identical geometry.
    expect(runtime.fatalIcon).toBe('/assets/icons/desk-fault.svg');
    expect(runtime.removedCount).toBe(1);
  });

  it('reports a live-rect fallback (not no-collision) when cached layout fields are missing', () => {
    const viewport = createRect({ left: 0, top: 0, width: 800, height: 300 });
    const player = createRect({ left: 100, top: 240, width: 40, height: 60 });
    const liveRect = createRect({ left: 105, top: 250, width: 30, height: 40 });
    const snapshots: ObstacleSnapshot[] = [
      {
        entityType: 'desk',
        hitboxScale: 1,
        // Explicitly missing cached layout metrics.
        currentLeftPx: 300,
        gameOverIcon: '/assets/icons/desk-fault.svg',
        cacheMissing: true,
      },
    ];

    const runtime = runRealObstacleFrame(
      snapshots,
      viewport,
      player,
      false,
      new Map([[0, liveRect]]),
    );
    const result = diagnoseCollisionsAndSpawns({
      viewport,
      playerRect: player,
      obstacles: snapshots,
      spawn: { ...baseSpawnParams },
    });

    const diagnostic = result.obstacles[0];
    expect(diagnostic.rectSource).toBe('live-rect-fallback');
    expect(diagnostic.classification).toBe('cache-missing-fallback');
    expect(diagnostic.hitbox).toBeNull();
    expect(diagnostic.notes.join(' ')).toContain('live element bounding rect');
    expect(
      result.checks.find((check) => check.name.includes('missing cached layout')),
    ).toMatchObject({ passed: true });

    // Runtime still performs a collision test using the live rect and faults.
    expect(runtime.fatalIcon).toBe('/assets/icons/desk-fault.svg');
    expect(runtime.removedCount).toBe(1);
  });

  it('returns readable degraded results when the viewport is missing', () => {
    const player = createRect({ left: 100, top: 240, width: 40, height: 60 });
    const result = diagnoseCollisionsAndSpawns({
      viewport: null,
      playerRect: player,
      obstacles: [
        {
          entityType: 'desk',
          hitboxScale: 1,
          entityWidthPx: 40,
          entityHeightPx: 40,
          entityBottomPx: 0,
          currentLeftPx: 300,
        },
      ],
      spawn: { ...baseSpawnParams },
    });

    expect(result.degraded).toBe(true);
    expect(result.degradationReasons.join(' ')).toContain('viewport');
    expect(result.obstacles[0].rectSource).toBe('live-rect-fallback');
    expect(result.obstacles[0].classification).toBe('cache-missing-fallback');
    expect(result.checks.find((check) => check.name.includes('viewport rect'))).toMatchObject({
      passed: false,
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('returns readable degraded results when spawn time differences are negative', () => {
    const viewport = createRect({ left: 0, top: 0, width: 800, height: 300 });
    const result = diagnoseCollisionsAndSpawns({
      viewport,
      playerRect: createRect({ left: 100, top: 240, width: 40, height: 60 }),
      obstacles: [],
      spawn: {
        ...baseSpawnParams,
        msSinceLastObstacleSpawn: -5,
        msSinceLastFishSpawn: -10,
        elapsedSinceStartMs: -1,
      },
    });

    expect(result.degraded).toBe(true);
    expect(result.degradationReasons.join(' ')).toContain('negative time difference');
    expect(result.obstacleSpawn.wouldSpawn).toBe(false);
    expect(result.fishSpawn.wouldSpawn).toBe(false);
    const timingCheck = result.checks.find((check) => check.name.includes('spawn timing inputs'));
    expect(timingCheck).toMatchObject({ passed: false });
    expect(timingCheck?.reason).toContain('msSinceLastObstacleSpawn');
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('stops fish spawns once the spawned count equals the target', () => {
    const viewport = createRect({ left: 0, top: 0, width: 800, height: 300 });
    const result = diagnoseCollisionsAndSpawns({
      viewport,
      playerRect: createRect({ left: 100, top: 240, width: 40, height: 60 }),
      obstacles: [],
      spawn: {
        ...baseSpawnParams,
        fishSpawnedCount: 20,
        fishSpawnTarget: 20,
      },
    });

    expect(result.fishSpawn.targetReached).toBe(true);
    expect(result.fishSpawn.wouldSpawn).toBe(false);
    expect(result.fishSpawn.reasons.join(' ')).toContain('target reached');
    expect(result.degraded).toBe(false);
  });

  it('models the obstacle scheduler interval, probability and cross-entity guard semantics', () => {
    const viewport = createRect({ left: 0, top: 0, width: 800, height: 300 });
    const rects = { viewport, playerRect: createRect({ left: 0, top: 0, width: 40, height: 60 }) };

    // Cross-entity guard blocks an otherwise-due obstacle spawn.
    const guarded = diagnoseCollisionsAndSpawns({
      ...rects,
      obstacles: [],
      spawn: {
        ...baseSpawnParams,
        msSinceLastObstacleSpawn: 2000,
        msSinceLastFishSpawn: CROSS_ENTITY_SPAWN_SEPARATION_MS - 1,
      },
    });
    expect(guarded.obstacleSpawn.crossEntityGuardPassed).toBe(false);
    expect(guarded.obstacleSpawn.wouldSpawn).toBe(false);
    expect(guarded.obstacleSpawn.reasons.join(' ')).toContain('cross-entity separation');

    // Tick not yet due.
    const notDue = diagnoseCollisionsAndSpawns({
      ...rects,
      obstacles: [],
      spawn: { ...baseSpawnParams, msSinceLastObstacleSpawn: 1499 },
    });
    expect(notDue.obstacleSpawn.tickFires).toBe(false);
    expect(notDue.obstacleSpawn.wouldSpawn).toBe(false);

    // Failed probability roll.
    const failedRoll = diagnoseCollisionsAndSpawns({
      ...rects,
      obstacles: [],
      spawn: { ...baseSpawnParams, obstacleRandomRoll: 0.99 },
    });
    expect(failedRoll.obstacleSpawn.probabilityGatePassed).toBe(false);
    expect(failedRoll.obstacleSpawn.wouldSpawn).toBe(false);

    // All gates pass in normal mode.
    const passing = diagnoseCollisionsAndSpawns({
      ...rects,
      obstacles: [],
      spawn: { ...baseSpawnParams, obstacleRandomRoll: 0.1 },
    });
    expect(passing.obstacleSpawn.wouldSpawn).toBe(true);
    expect(passing.obstacleSpawn.appliedSpawnRate).toBe(0.98);

    // Boss visible without pattern-2: normal spawns suppressed.
    const bossSuppressed = diagnoseCollisionsAndSpawns({
      ...rects,
      obstacles: [],
      spawn: {
        ...baseSpawnParams,
        bossVisible: true,
        bossPatternTwoActive: false,
        obstacleRandomRoll: 0.1,
      },
    });
    expect(bossSuppressed.obstacleSpawn.wouldSpawn).toBe(false);
    expect(bossSuppressed.obstacleSpawn.reasons.join(' ')).toContain('suppressed');

    // Boss pattern-2 uses the boss rate and shortened interval.
    const patternTwo = diagnoseCollisionsAndSpawns({
      ...rects,
      obstacles: [],
      spawn: {
        ...baseSpawnParams,
        bossVisible: true,
        bossPatternTwoActive: true,
        obstacleRandomRoll: 0.5,
      },
    });
    const expectedPatternTwoInterval = Math.max(
      BOSS_PATTERN_TWO_MIN_SPAWN_INTERVAL_MS,
      Math.floor(1500 * BOSS_PATTERN_TWO_SPAWN_INTERVAL_FACTOR),
    );
    expect(patternTwo.obstacleSpawn.effectiveIntervalMs).toBe(expectedPatternTwoInterval);
    expect(patternTwo.obstacleSpawn.appliedSpawnRate).toBe(BOSS_PATTERN_TWO_OBSTACLE_RATE);
    expect(patternTwo.obstacleSpawn.wouldSpawn).toBe(true);

    // Fish cross-entity guard defers fish spawns after a recent obstacle.
    const fishGuarded = diagnoseCollisionsAndSpawns({
      ...rects,
      obstacles: [],
      spawn: {
        ...baseSpawnParams,
        msSinceLastObstacleSpawn: CROSS_ENTITY_SPAWN_SEPARATION_MS - 1,
      },
    });
    expect(fishGuarded.fishSpawn.crossEntityGuardPassed).toBe(false);
    expect(fishGuarded.fishSpawn.wouldSpawn).toBe(false);
    expect(fishGuarded.fishSpawn.reasons.join(' ')).toContain('deferred');

    // Clear deadline gate.
    const afterClear = diagnoseCollisionsAndSpawns({
      ...rects,
      obstacles: [],
      spawn: { ...baseSpawnParams, elapsedSinceStartMs: CLEAR_DURATION_MS },
    });
    expect(afterClear.fishSpawn.clearDeadlineReached).toBe(true);
    expect(afterClear.fishSpawn.wouldSpawn).toBe(false);
  });

  it('produces fully JSON-serializable output containing only plain data', () => {
    const viewport = createRect({ left: 10, top: 5, width: 640, height: 280 });
    const result = diagnoseCollisionsAndSpawns({
      viewport,
      playerRect: createRect({ left: 120, top: 220, width: 36, height: 52 }),
      obstacles: [
        {
          entityType: 'fish',
          hitboxScale: 0.6,
          entityWidthPx: 24,
          entityHeightPx: 24,
          entityBottomPx: 60,
          currentLeftPx: 130,
        },
        {
          entityType: 'desk',
          entityWidthPx: 40,
          entityHeightPx: 40,
          entityBottomPx: 0,
          currentLeftPx: -40,
        },
      ],
      spawn: { ...baseSpawnParams },
    });

    const serialized = JSON.stringify(result);
    expect(() => JSON.parse(serialized)).not.toThrow();
    const roundTripped = JSON.parse(serialized);
    expect(roundTripped).toEqual(result);
    // No functions or class instances survive serialization.
    expect(serialized).not.toContain('[object Object]');
    expect(typeof roundTripped.diagnose).toBe('undefined');
    expect(Array.isArray(roundTripped.checks)).toBe(true);
    expect(Array.isArray(roundTripped.obstacles)).toBe(true);
  });

  it('never throws on malformed snapshot input and marks affected fields', () => {
    const nonFiniteScale = diagnoseCollisionsAndSpawns({
      viewport: createRect({ left: 0, top: 0, width: 800, height: 300 }),
      playerRect: createRect({ left: 0, top: 0, width: 40, height: 60 }),
      obstacles: [
        {
          entityType: 'desk',
          hitboxScale: Number.NaN,
          entityWidthPx: 40,
          entityHeightPx: 40,
          entityBottomPx: 0,
          currentLeftPx: 100,
        },
      ],
      spawn: { ...baseSpawnParams },
    });
    expect(nonFiniteScale.obstacles[0].appliedHitboxScale).toBeNull();
    expect(nonFiniteScale.obstacles[0].classification).toBe('cache-missing-fallback');
    expect(() => JSON.stringify(nonFiniteScale)).not.toThrow();

    // Entirely malformed snapshot.
    // @ts-expect-error intentionally passing invalid input to prove graceful degradation
    const broken = diagnoseCollisionsAndSpawns(undefined);
    expect(broken.degraded).toBe(true);
    expect(broken.degradationReasons.length).toBeGreaterThan(0);
    expect(() => JSON.stringify(broken)).not.toThrow();
  });
});
