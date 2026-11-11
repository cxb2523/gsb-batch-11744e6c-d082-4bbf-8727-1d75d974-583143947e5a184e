import { BOSS_GAME_OVER_ICON } from '../config/assets';
import { OBSTACLES_DEADLINE } from '../config/gameplay';
import {
  DEFAULT_OBSTACLE_HITBOX_SCALE,
  OBSTACLE_PLAYER_PROXIMITY_CHECK_PX,
} from '../config/game-loop';
import {
  BOSS_PATTERN_TWO_MIN_SPAWN_INTERVAL_MS,
  BOSS_PATTERN_TWO_OBSTACLE_RATE,
  BOSS_PATTERN_TWO_SPAWN_INTERVAL_FACTOR,
  CLEAR_DURATION_MS,
  CROSS_ENTITY_SPAWN_SEPARATION_MS,
} from '../config/scene-spawn';

const HITBOX_SYMMETRIC_INSET_DIVISOR = 2;
const FISH_ENTITY_TYPE = 'fish';

/**
 * Axis-aligned rectangle expressed as plain serializable data.
 */
export type DiagnosticsRect = {
  /** Left edge in viewport pixels. */
  left: number;
  /** Right edge in viewport pixels. */
  right: number;
  /** Top edge in viewport pixels. */
  top: number;
  /** Bottom edge in viewport pixels. */
  bottom: number;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
};

/**
 * Pure-data snapshot of a single moving obstacle/fish entity.
 */
export type ObstacleSnapshot = {
  /** Value of the entity's `data-entity-type` dataset field (e.g. `fish`). */
  entityType?: string | null;
  /** Value of the entity's `data-hitbox-scale` dataset field when present. */
  hitboxScale?: number | null;
  /** Cached `entityWidthPx` dataset value when available. */
  entityWidthPx?: number | null;
  /** Cached `entityHeightPx` dataset value when available. */
  entityHeightPx?: number | null;
  /** Cached `entityBottomPx` dataset value when available. */
  entityBottomPx?: number | null;
  /** Explicit marker that one or more cached layout fields are unavailable. */
  cacheMissing?: boolean;
  /** Current horizontal position in viewport pixels (post-motion `currentLeftPx`). */
  currentLeftPx: number;
  /** Value of the entity's `data-game-over-icon` dataset field. */
  gameOverIcon?: string | null;
};

/**
 * Snapshot of the spawn-side scheduler inputs for one tick.
 */
export type SpawnDiagnosticsSnapshot = {
  /** Baseline obstacle spawn interval in milliseconds. */
  obstacleSpawnInterval: number;
  /** Spawn probability used during normal-mode ticks. */
  normalSpawnRate: number;
  /** True while the boss pattern-2 attack window is active. */
  bossPatternTwoActive: boolean;
  /** Whether the boss is currently visible; when true normal obstacle spawns are suppressed. */
  bossVisible?: boolean;
  /** Milliseconds elapsed since an obstacle was last actually spawned. */
  msSinceLastObstacleSpawn: number;
  /** Milliseconds elapsed since a fish was last actually spawned. */
  msSinceLastFishSpawn: number;
  /** Number of fish already spawned in this run. */
  fishSpawnedCount: number;
  /** Total number of fish to spawn in this run. */
  fishSpawnTarget: number;
  /** Milliseconds elapsed since the match started. */
  elapsedSinceStartMs: number;
  /**
   * Deterministic random roll replacing the obstacle scheduler's `Math.random()`.
   * When omitted the probability gate is reported as indeterminate.
   */
  obstacleRandomRoll?: number | null;
  /**
   * Elapsed time at which the next fish spawn becomes due.
   * When omitted the fish due-time gate is reported as indeterminate.
   */
  nextFishSpawnDueElapsedMs?: number | null;
};

/**
 * Pure-data input snapshot for the collision/spawn diagnostics.
 */
export type CollisionDiagnosticsSnapshot = {
  /** Game viewport rectangle in viewport coordinates. */
  viewport?: DiagnosticsRect | null;
  /** Player rectangle in viewport coordinates. */
  playerRect?: DiagnosticsRect | null;
  /** Active obstacle/fish snapshots in the same order as the runtime list. */
  obstacles: ObstacleSnapshot[];
  /** Scheduler-side inputs used to reason about the current tick. */
  spawn: SpawnDiagnosticsSnapshot;
};

/**
 * Single ordered diagnostic check entry.
 */
export type DiagnosticCheck = {
  /** Stable, human-readable check name. */
  name: string;
  /** Whether the check passed. */
  passed: boolean;
  /** Human-readable reason when the check did not pass; `null` otherwise. */
  reason: string | null;
};

/**
 * Classification of a single obstacle after applying the runtime rules.
 */
export type ObstacleDiagnosticClassification =
  | 'fish-collected'
  | 'fatal-collision'
  | 'no-collision'
  | 'out-of-bounds-removed'
  | 'cache-missing-fallback';

/**
 * Source used to reconstruct the obstacle rectangle.
 */
export type ObstacleRectSource = 'cached-layout' | 'live-rect-fallback' | 'unavailable';

/**
 * Per-obstacle diagnostic result.
 */
export type ObstacleDiagnostic = {
  /** Index of the obstacle in the input snapshot. */
  index: number;
  /** Entity type copied from the snapshot. */
  entityType: string | null;
  /** Current horizontal position in viewport pixels. */
  currentLeftPx: number;
  /** Hitbox scale actually applied (including default fallback). */
  appliedHitboxScale: number | null;
  /** Whether the default scale was applied because the snapshot scale was absent. */
  hitboxScaleFellBackToDefault: boolean;
  /** Source the rectangle was reconstructed from. */
  rectSource: ObstacleRectSource;
  /** Reconstructed obstacle rectangle when available. */
  obstacleRect: DiagnosticsRect | null;
  /** Symmetrically shrunk hitbox edges when computable. */
  hitbox: DiagnosticsRect | null;
  /** Whether the entity is close enough to the player for collision checks to run. */
  withinProximityCheckRange: boolean;
  /** Whether the entity crossed the removal deadline. */
  isOutOfBounds: boolean;
  /** Overlap verdict against the player rectangle; `null` when undecidable. */
  overlapsPlayer: boolean | null;
  /** Final classification under the runtime rules. */
  classification: ObstacleDiagnosticClassification;
  /** Whether the runtime would remove the entity during this frame. */
  wouldRemove: boolean;
  /** Fatal icon the runtime would emit, when applicable. */
  fatalIcon: string | null;
  /** Human-readable notes explaining fallback/degraded handling. */
  notes: string[];
};

/**
 * Deterministic spawn decision details for the obstacle interval tick.
 */
export type ObstacleSpawnDiagnostic = {
  /** Effective interval applied by the scheduler for the current mode. */
  effectiveIntervalMs: number;
  /** Whether the interval/timeout for this tick has elapsed. */
  tickFires: boolean;
  /** Whether the provided roll passes the active probability gate. */
  probabilityGatePassed: boolean | null;
  /** Probability threshold applied for the current mode. */
  appliedSpawnRate: number;
  /** Whether the cross-entity separation guard relative to fish spawns is satisfied. */
  crossEntityGuardPassed: boolean;
  /** Whether the scheduler would actually spawn an obstacle on this tick. */
  wouldSpawn: boolean;
  /** Ordered human-readable reasons explaining the decision. */
  reasons: string[];
};

/**
 * Deterministic spawn decision details for the fish timeout tick.
 */
export type FishSpawnDiagnostic = {
  /** Whether the fish spawn target has already been reached. */
  targetReached: boolean;
  /** Whether the clear deadline has been reached. */
  clearDeadlineReached: boolean;
  /** Whether the next scheduled fish spawn time is due (null when not provided). */
  nextSpawnDue: boolean | null;
  /** Whether the cross-entity separation guard relative to obstacle spawns is satisfied. */
  crossEntityGuardPassed: boolean;
  /** Whether the scheduler would actually spawn a fish on this tick. */
  wouldSpawn: boolean;
  /** Ordered human-readable reasons explaining the decision. */
  reasons: string[];
};

/**
 * Structured, JSON-serializable result of the collision/spawn diagnostics.
 */
export type CollisionDiagnosticsResult = {
  /** Whether one or more degraded/indeterminate conditions were detected. */
  degraded: boolean;
  /** Readable descriptions of degraded conditions and the fields they affect. */
  degradationReasons: string[];
  /** Per-obstacle diagnostic entries in snapshot order. */
  obstacles: ObstacleDiagnostic[];
  /** Obstacle scheduler decision for the current tick. */
  obstacleSpawn: ObstacleSpawnDiagnostic;
  /** Fish scheduler decision for the current tick. */
  fishSpawn: FishSpawnDiagnostic;
  /** Ordered checklist of every rule that was evaluated. */
  checks: DiagnosticCheck[];
};

type CheckAccumulator = {
  checks: DiagnosticCheck[];
};

const recordCheck = (
  accumulator: CheckAccumulator,
  name: string,
  passed: boolean,
  reason: string | null = null,
) => {
  accumulator.checks.push({ name, passed, reason: passed ? null : reason });
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRectUsable = (rect: DiagnosticsRect | null | undefined): rect is DiagnosticsRect =>
  !!rect &&
  isFiniteNumber(rect.left) &&
  isFiniteNumber(rect.right) &&
  isFiniteNumber(rect.top) &&
  isFiniteNumber(rect.bottom) &&
  isFiniteNumber(rect.width) &&
  isFiniteNumber(rect.height);

/**
 * Shrinks a rectangle around its center using the provided hitbox scale.
 * Mirrors `getScaledHitboxFromRectLike` in `obstacles.ts` exactly.
 *
 * @param rect - Source rectangle in viewport coordinates.
 * @param scale - Collision scale applied symmetrically on both axes.
 * @returns Scaled hitbox bounds derived from the original rectangle.
 */
const getScaledHitboxFromRect = (rect: DiagnosticsRect, scale: number): DiagnosticsRect => {
  const insetX = (rect.width * (1 - scale)) / HITBOX_SYMMETRIC_INSET_DIVISOR;
  const insetY = (rect.height * (1 - scale)) / HITBOX_SYMMETRIC_INSET_DIVISOR;
  return {
    left: rect.left + insetX,
    right: rect.right - insetX,
    top: rect.top + insetY,
    bottom: rect.bottom - insetY,
    width: rect.width * scale,
    height: rect.height * scale,
  };
};

/**
 * Reconstructs obstacle bounds from cached layout metrics.
 * Mirrors `getObstacleRectFromCachedLayout` in `obstacles.ts` exactly.
 *
 * @param snapshot - Obstacle snapshot holding cached width/height/bottom values.
 * @param viewport - Current game viewport bounds in viewport coordinates.
 * @returns Reconstructed bounds or `null` when required metrics are unavailable.
 */
const getObstacleRectFromCachedLayout = (
  snapshot: ObstacleSnapshot,
  viewport: DiagnosticsRect,
): DiagnosticsRect | null => {
  const { entityWidthPx: widthPx, entityHeightPx: heightPx, entityBottomPx: bottomPx } = snapshot;
  if (!isFiniteNumber(widthPx) || !isFiniteNumber(heightPx) || !isFiniteNumber(bottomPx)) {
    return null;
  }
  const left = viewport.left + snapshot.currentLeftPx;
  const top = viewport.bottom - bottomPx - heightPx;
  return {
    left,
    right: left + widthPx,
    top,
    bottom: top + heightPx,
    width: widthPx,
    height: heightPx,
  };
};

/**
 * Axis-aligned overlap test mirroring `isPlayerOverlappingHitbox` in `helpers.ts`.
 *
 * @param player - Player rectangle in viewport coordinates.
 * @param hitbox - Scaled obstacle hitbox in viewport coordinates.
 * @returns True when the two boxes overlap.
 */
const isPlayerOverlappingHitbox = (player: DiagnosticsRect, hitbox: DiagnosticsRect): boolean =>
  player.left < hitbox.right &&
  player.right > hitbox.left &&
  player.bottom > hitbox.top &&
  player.top < hitbox.bottom;

const resolveHitboxScale = (
  snapshot: ObstacleSnapshot,
  notes: string[],
): { scale: number | null; fellBackToDefault: boolean; invalid: boolean } => {
  if (snapshot.hitboxScale === undefined || snapshot.hitboxScale === null) {
    notes.push(
      `hitboxScale missing; falling back to DEFAULT_OBSTACLE_HITBOX_SCALE=${DEFAULT_OBSTACLE_HITBOX_SCALE}`,
    );
    return { scale: DEFAULT_OBSTACLE_HITBOX_SCALE, fellBackToDefault: true, invalid: false };
  }
  if (!isFiniteNumber(snapshot.hitboxScale)) {
    notes.push('hitboxScale is not a finite number; hitbox cannot be computed reliably');
    return { scale: null, fellBackToDefault: false, invalid: true };
  }
  return { scale: snapshot.hitboxScale, fellBackToDefault: false, invalid: false };
};

const diagnoseObstacle = (
  snapshot: ObstacleSnapshot,
  index: number,
  viewport: DiagnosticsRect | null,
  player: DiagnosticsRect | null,
  viewportMissing: boolean,
  playerMissing: boolean,
  isBossVisible: boolean,
  checkBook: CheckAccumulator,
): ObstacleDiagnostic => {
  const notes: string[] = [];
  const base: ObstacleDiagnostic = {
    index,
    entityType: snapshot.entityType ?? null,
    currentLeftPx: snapshot.currentLeftPx,
    appliedHitboxScale: null,
    hitboxScaleFellBackToDefault: false,
    rectSource: 'unavailable',
    obstacleRect: null,
    hitbox: null,
    withinProximityCheckRange: false,
    isOutOfBounds: false,
    overlapsPlayer: null,
    classification: 'no-collision',
    wouldRemove: false,
    fatalIcon: null,
    notes,
  };

  // Rule: entities crossing OBSTACLES_DEADLINE are removed before any collision work.
  if (isFiniteNumber(snapshot.currentLeftPx) && snapshot.currentLeftPx < OBSTACLES_DEADLINE) {
    base.isOutOfBounds = true;
    base.classification = 'out-of-bounds-removed';
    base.wouldRemove = true;
    notes.push(
      `currentLeftPx=${snapshot.currentLeftPx} is below OBSTACLES_DEADLINE=${OBSTACLES_DEADLINE}; entity is removed without collision checks`,
    );
    recordCheck(
      checkBook,
      `obstacle[${index}] out-of-bounds entity is removed and skips collision`,
      true,
    );
    return base;
  }

  if (!isFiniteNumber(snapshot.currentLeftPx)) {
    notes.push('currentLeftPx is missing or non-finite; motion/proximity cannot be evaluated');
  }

  // Rule: collision checks only run within OBSTACLE_PLAYER_PROXIMITY_CHECK_PX of the player.
  const gameWidth = viewport?.width;
  base.withinProximityCheckRange =
    isFiniteNumber(snapshot.currentLeftPx) &&
    isFiniteNumber(gameWidth) &&
    snapshot.currentLeftPx < gameWidth - OBSTACLE_PLAYER_PROXIMITY_CHECK_PX;

  const { scale, fellBackToDefault, invalid: scaleInvalid } = resolveHitboxScale(snapshot, notes);
  base.appliedHitboxScale = scale;
  base.hitboxScaleFellBackToDefault = fellBackToDefault;
  recordCheck(
    checkBook,
    `obstacle[${index}] hitboxScale falls back to default when absent`,
    !fellBackToDefault || scale === DEFAULT_OBSTACLE_HITBOX_SCALE,
    fellBackToDefault ? notes[notes.length - 1] : null,
  );

  const cacheFieldsMissing =
    snapshot.cacheMissing === true ||
    !isFiniteNumber(snapshot.entityWidthPx) ||
    !isFiniteNumber(snapshot.entityHeightPx) ||
    !isFiniteNumber(snapshot.entityBottomPx);

  let cachedRect: DiagnosticsRect | null = null;
  if (viewport !== null && !cacheFieldsMissing) {
    cachedRect = getObstacleRectFromCachedLayout(snapshot, viewport);
  }

  if (viewportMissing) {
    notes.push('viewport rect missing; runtime would read a live element bounding rect instead');
  } else if (cacheFieldsMissing) {
    notes.push(
      'cached layout fields (entityWidthPx/entityHeightPx/entityBottomPx) missing; runtime falls back to a live element bounding rect instead of treating the entity as collision-free',
    );
  }

  if (cachedRect !== null) {
    base.rectSource = 'cached-layout';
    base.obstacleRect = cachedRect;
  } else if (viewportMissing || cacheFieldsMissing) {
    base.rectSource = 'live-rect-fallback';
  }

  recordCheck(
    checkBook,
    `obstacle[${index}] missing cached layout is reported as live-rect fallback, not no-collision`,
    !(cacheFieldsMissing && base.rectSource !== 'live-rect-fallback'),
    cacheFieldsMissing && base.rectSource !== 'live-rect-fallback'
      ? 'cached layout missing but fallback was not marked'
      : null,
  );

  if (scaleInvalid || base.obstacleRect === null) {
    // No deterministic hitbox can be produced: report fallback rather than fabricating one.
    base.classification = 'cache-missing-fallback';
    base.overlapsPlayer = null;
    if (base.rectSource === 'unavailable' && viewport !== null && !cacheFieldsMissing) {
      base.rectSource = 'unavailable';
    }
    return base;
  }

  if (scale !== null) {
    base.hitbox = getScaledHitboxFromRect(base.obstacleRect, scale);
  }

  if (!base.withinProximityCheckRange) {
    base.classification = 'no-collision';
    base.overlapsPlayer = false;
    notes.push('entity is outside the player proximity window; runtime performs no collision test');
    return base;
  }

  if (playerMissing || player === null) {
    base.classification = 'cache-missing-fallback';
    base.overlapsPlayer = null;
    notes.push('player rect missing; overlap verdict cannot be determined from the snapshot');
    return base;
  }

  const overlaps = isPlayerOverlappingHitbox(player, base.hitbox as DiagnosticsRect);
  base.overlapsPlayer = overlaps;

  if (!overlaps) {
    base.classification = 'no-collision';
    return base;
  }

  const isFish = snapshot.entityType === FISH_ENTITY_TYPE;
  if (isFish) {
    // Rule: fish is consumed via onFishCollected and must never produce a fatal icon.
    base.classification = 'fish-collected';
    base.wouldRemove = true;
    base.fatalIcon = null;
    recordCheck(
      checkBook,
      `obstacle[${index}] fish collision never produces a fatal icon`,
      base.fatalIcon === null,
      base.fatalIcon === null ? null : 'fish collision emitted a fatal icon',
    );
    return base;
  }

  base.classification = 'fatal-collision';
  base.wouldRemove = true;
  base.fatalIcon = isBossVisible ? BOSS_GAME_OVER_ICON : (snapshot.gameOverIcon ?? null);
  return base;
};

const diagnoseObstacleSpawn = (
  spawn: SpawnDiagnosticsSnapshot,
  isBossVisible: boolean,
  checkBook: CheckAccumulator,
): ObstacleSpawnDiagnostic => {
  const reasons: string[] = [];
  const patternTwoInterval = Math.max(
    BOSS_PATTERN_TWO_MIN_SPAWN_INTERVAL_MS,
    Math.floor(spawn.obstacleSpawnInterval * BOSS_PATTERN_TWO_SPAWN_INTERVAL_FACTOR),
  );
  const effectiveIntervalMs = spawn.bossPatternTwoActive
    ? patternTwoInterval
    : spawn.obstacleSpawnInterval;

  const tickFires = spawn.msSinceLastObstacleSpawn >= effectiveIntervalMs;
  if (!tickFires) {
    reasons.push(
      `obstacle tick not due: ${spawn.msSinceLastObstacleSpawn}ms < interval ${effectiveIntervalMs}ms`,
    );
  }

  const crossEntityGuardPassed = spawn.msSinceLastFishSpawn >= CROSS_ENTITY_SPAWN_SEPARATION_MS;
  if (!crossEntityGuardPassed) {
    reasons.push(
      `cross-entity separation not met: ${spawn.msSinceLastFishSpawn}ms since last fish spawn < ${CROSS_ENTITY_SPAWN_SEPARATION_MS}ms; spawn is deferred`,
    );
  }

  let probabilityGatePassed: boolean | null = null;
  const appliedSpawnRate = spawn.bossPatternTwoActive
    ? BOSS_PATTERN_TWO_OBSTACLE_RATE
    : spawn.normalSpawnRate;
  if (isFiniteNumber(spawn.obstacleRandomRoll)) {
    probabilityGatePassed = (spawn.obstacleRandomRoll as number) < appliedSpawnRate;
    if (!probabilityGatePassed) {
      reasons.push(
        `probability gate failed: roll ${spawn.obstacleRandomRoll} >= rate ${appliedSpawnRate}`,
      );
    }
  } else {
    reasons.push('no obstacle random roll provided; probability gate is indeterminate');
  }

  const normalSpawnSuppressed = isBossVisible && !spawn.bossPatternTwoActive;
  if (isBossVisible) {
    if (normalSpawnSuppressed) {
      reasons.push(
        'boss is visible and pattern-2 is inactive; normal obstacle spawn is suppressed',
      );
    }
    recordCheck(
      checkBook,
      'normal obstacle spawns are suppressed while the boss is visible',
      !normalSpawnSuppressed ||
        !tickFires ||
        !crossEntityGuardPassed ||
        probabilityGatePassed !== true,
      normalSpawnSuppressed && tickFires && crossEntityGuardPassed && probabilityGatePassed === true
        ? 'normal obstacle spawn leaked while boss was visible'
        : null,
    );
  } else {
    recordCheck(checkBook, 'normal obstacle spawns are suppressed while the boss is visible', true);
  }

  recordCheck(
    checkBook,
    'obstacle spawn respects cross-entity separation from recent fish spawns',
    crossEntityGuardPassed || !tickFires,
    !crossEntityGuardPassed && tickFires
      ? (reasons.find((r) => r.includes('cross-entity')) ?? null)
      : null,
  );

  const deterministicGatesPassed = tickFires && crossEntityGuardPassed;
  const wouldSpawn = isBossVisible
    ? spawn.bossPatternTwoActive && deterministicGatesPassed && probabilityGatePassed === true
    : deterministicGatesPassed && probabilityGatePassed === true;

  if (wouldSpawn) {
    reasons.push('all obstacle spawn gates passed; scheduler would spawn an obstacle');
  }

  return {
    effectiveIntervalMs,
    tickFires,
    probabilityGatePassed,
    appliedSpawnRate,
    crossEntityGuardPassed,
    wouldSpawn,
    reasons,
  };
};

const diagnoseFishSpawn = (
  spawn: SpawnDiagnosticsSnapshot,
  checkBook: CheckAccumulator,
): FishSpawnDiagnostic => {
  const reasons: string[] = [];
  const targetReached = spawn.fishSpawnedCount >= spawn.fishSpawnTarget;
  if (targetReached) {
    reasons.push(
      `fish spawn target reached: ${spawn.fishSpawnedCount} >= ${spawn.fishSpawnTarget}; scheduler stops spawning fish`,
    );
  }

  const clearDeadlineReached = spawn.elapsedSinceStartMs >= CLEAR_DURATION_MS;
  if (clearDeadlineReached) {
    reasons.push(
      `clear deadline reached: ${spawn.elapsedSinceStartMs}ms >= ${CLEAR_DURATION_MS}ms; no further fish spawns`,
    );
  }

  let nextSpawnDue: boolean | null = null;
  if (isFiniteNumber(spawn.nextFishSpawnDueElapsedMs)) {
    nextSpawnDue = spawn.elapsedSinceStartMs >= (spawn.nextFishSpawnDueElapsedMs as number);
    if (!nextSpawnDue) {
      reasons.push(
        `next fish spawn not due yet: ${spawn.elapsedSinceStartMs}ms < ${spawn.nextFishSpawnDueElapsedMs}ms`,
      );
    }
  } else {
    reasons.push('next fish spawn due time not provided; due-time gate is indeterminate');
  }

  const crossEntityGuardPassed = spawn.msSinceLastObstacleSpawn >= CROSS_ENTITY_SPAWN_SEPARATION_MS;
  if (!crossEntityGuardPassed) {
    reasons.push(
      `cross-entity separation not met: ${spawn.msSinceLastObstacleSpawn}ms since last obstacle spawn < ${CROSS_ENTITY_SPAWN_SEPARATION_MS}ms; fish spawn is deferred until the guard clears`,
    );
  }

  recordCheck(
    checkBook,
    'fish spawn respects cross-entity separation from recent obstacle spawns',
    crossEntityGuardPassed,
    crossEntityGuardPassed ? null : (reasons.find((r) => r.includes('cross-entity')) ?? null),
  );

  const wouldSpawn =
    !targetReached && !clearDeadlineReached && nextSpawnDue === true && crossEntityGuardPassed;
  if (wouldSpawn) {
    reasons.push('all fish spawn gates passed; scheduler would spawn a fish');
  }

  return {
    targetReached,
    clearDeadlineReached,
    nextSpawnDue,
    crossEntityGuardPassed,
    wouldSpawn,
    reasons,
  };
};

/**
 * Produces a pure, JSON-serializable collision and spawn diagnosis for one frame snapshot.
 *
 * The function never touches the DOM, creates elements, or performs I/O. Missing or invalid
 * inputs produce a degraded result with readable per-field reasons instead of throwing.
 *
 * @param snapshot - Pure-data viewport/player/obstacle/spawn snapshot for the current frame.
 * @returns Structured diagnosis including hitboxes, classifications, spawn decisions and checks.
 */
export const diagnoseCollisionsAndSpawns = (
  snapshot: CollisionDiagnosticsSnapshot,
): CollisionDiagnosticsResult => {
  const checkBook: CheckAccumulator = { checks: [] };
  const degradationReasons: string[] = [];

  try {
    const safeSnapshot: CollisionDiagnosticsSnapshot =
      snapshot && typeof snapshot === 'object'
        ? snapshot
        : { obstacles: [], spawn: {} as SpawnDiagnosticsSnapshot };
    const obstacles = Array.isArray(safeSnapshot.obstacles) ? safeSnapshot.obstacles : [];
    const spawn = (safeSnapshot.spawn ?? {}) as Partial<SpawnDiagnosticsSnapshot>;

    const viewportUsable = isRectUsable(safeSnapshot.viewport);
    const playerUsable = isRectUsable(safeSnapshot.playerRect);
    if (!viewportUsable) {
      degradationReasons.push(
        'viewport rect missing or contains non-finite fields (affected: viewport, per-obstacle cached hitboxes); live bounding rects would be used at runtime',
      );
    }
    if (!playerUsable) {
      degradationReasons.push(
        'player rect missing or contains non-finite fields (affected: playerRect, overlap verdicts)',
      );
    }
    recordCheck(
      checkBook,
      'viewport rect is present and finite',
      viewportUsable,
      !viewportUsable ? degradationReasons[0] : null,
    );
    recordCheck(
      checkBook,
      'player rect is present and finite',
      playerUsable,
      !playerUsable ? degradationReasons[degradationReasons.length - 1] : null,
    );

    const msSinceLastObstacleSpawn = isFiniteNumber(spawn.msSinceLastObstacleSpawn)
      ? (spawn.msSinceLastObstacleSpawn as number)
      : Number.NaN;
    const msSinceLastFishSpawn = isFiniteNumber(spawn.msSinceLastFishSpawn)
      ? (spawn.msSinceLastFishSpawn as number)
      : Number.NaN;
    const elapsedSinceStartMs = isFiniteNumber(spawn.elapsedSinceStartMs)
      ? (spawn.elapsedSinceStartMs as number)
      : Number.NaN;

    const negativeTimeFields: string[] = [];
    if (msSinceLastObstacleSpawn < 0) negativeTimeFields.push('msSinceLastObstacleSpawn');
    if (msSinceLastFishSpawn < 0) negativeTimeFields.push('msSinceLastFishSpawn');
    if (elapsedSinceStartMs < 0) negativeTimeFields.push('elapsedSinceStartMs');
    if (negativeTimeFields.length > 0) {
      degradationReasons.push(
        `negative time difference(s) in ${negativeTimeFields.join(', ')} (affected: spawn timing gates); spawn decisions are reported as not-due`,
      );
    }
    recordCheck(
      checkBook,
      'spawn timing inputs are non-negative finite numbers',
      negativeTimeFields.length === 0,
      negativeTimeFields.length > 0
        ? `negative or invalid time fields: ${negativeTimeFields.join(', ')}`
        : null,
    );

    const normalizedSpawn: SpawnDiagnosticsSnapshot = {
      obstacleSpawnInterval: isFiniteNumber(spawn.obstacleSpawnInterval)
        ? (spawn.obstacleSpawnInterval as number)
        : 0,
      normalSpawnRate: isFiniteNumber(spawn.normalSpawnRate)
        ? (spawn.normalSpawnRate as number)
        : 0,
      bossPatternTwoActive: spawn.bossPatternTwoActive === true,
      bossVisible: spawn.bossVisible === true,
      msSinceLastObstacleSpawn:
        msSinceLastObstacleSpawn < 0 ? Number.NaN : msSinceLastObstacleSpawn,
      msSinceLastFishSpawn: msSinceLastFishSpawn < 0 ? Number.NaN : msSinceLastFishSpawn,
      fishSpawnedCount: isFiniteNumber(spawn.fishSpawnedCount)
        ? (spawn.fishSpawnedCount as number)
        : 0,
      fishSpawnTarget: isFiniteNumber(spawn.fishSpawnTarget)
        ? (spawn.fishSpawnTarget as number)
        : 0,
      elapsedSinceStartMs: elapsedSinceStartMs < 0 ? Number.NaN : elapsedSinceStartMs,
      obstacleRandomRoll: isFiniteNumber(spawn.obstacleRandomRoll)
        ? (spawn.obstacleRandomRoll as number)
        : null,
      nextFishSpawnDueElapsedMs: isFiniteNumber(spawn.nextFishSpawnDueElapsedMs)
        ? (spawn.nextFishSpawnDueElapsedMs as number)
        : null,
    };

    const isBossVisible = normalizedSpawn.bossVisible === true;
    const viewport = viewportUsable ? (safeSnapshot.viewport as DiagnosticsRect) : null;
    const player = playerUsable ? (safeSnapshot.playerRect as DiagnosticsRect) : null;

    const obstacleDiagnostics = obstacles.map((obstacle, index) =>
      diagnoseObstacle(
        obstacle,
        index,
        viewport,
        player,
        !viewportUsable,
        !playerUsable,
        isBossVisible,
        checkBook,
      ),
    );

    const obstacleSpawn = diagnoseObstacleSpawn(normalizedSpawn, isBossVisible, checkBook);
    const fishSpawn = diagnoseFishSpawn(normalizedSpawn, checkBook);

    recordCheck(checkBook, 'diagnostics output is fully JSON-serializable plain data', true);

    return {
      degraded: degradationReasons.length > 0,
      degradationReasons,
      obstacles: obstacleDiagnostics,
      obstacleSpawn,
      fishSpawn,
      checks: checkBook.checks,
    };
  } catch (error) {
    const reason = `unexpected diagnostics failure: ${error instanceof Error ? error.message : String(error)}`;
    degradationReasons.push(reason);
    recordCheck(checkBook, 'diagnostics completed without an uncaught exception', false, reason);
    return {
      degraded: true,
      degradationReasons,
      obstacles: [],
      obstacleSpawn: {
        effectiveIntervalMs: 0,
        tickFires: false,
        probabilityGatePassed: null,
        appliedSpawnRate: 0,
        crossEntityGuardPassed: false,
        wouldSpawn: false,
        reasons: [reason],
      },
      fishSpawn: {
        targetReached: false,
        clearDeadlineReached: false,
        nextSpawnDue: null,
        crossEntityGuardPassed: false,
        wouldSpawn: false,
        reasons: [reason],
      },
      checks: checkBook.checks,
    };
  }
};
