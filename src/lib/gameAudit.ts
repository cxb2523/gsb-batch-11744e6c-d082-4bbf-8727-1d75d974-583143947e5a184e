/**
 * Frame-stepping audit for Dino Runner.
 *
 * This module is a pure, side-effect-free re-implementation of the per-frame
 * semantics found in `src/components/DinoGame.tsx` (`gameLoop`). It never
 * touches the canvas, the DOM, `requestAnimationFrame`, timers, storage or the
 * network, and it never reads or writes files. Every value it returns is plain
 * JSON-serializable data (numbers, strings, booleans, null, plain objects and
 * arrays) — no functions or class instances are part of the output.
 *
 * The constants below intentionally mirror the values declared inside the
 * `useEffect` of `DinoGame.tsx`. They are duplicated rather than imported so
 * that the audit remains usable without a React/DOM runtime.
 */

// --- Game constants (must stay in lock-step with DinoGame.tsx) -------------

export const AUDIT_CANVAS_WIDTH = 800;
export const AUDIT_CANVAS_HEIGHT = 300;
/** GROUND_Y = CANVAS_HEIGHT - 50 */
export const AUDIT_GROUND_Y = AUDIT_CANVAS_HEIGHT - 50;
export const AUDIT_GRAVITY = 0.8;

export const AUDIT_CACTUS_WIDTH = 20;
export const AUDIT_CACTUS_HEIGHT = 40;
export const AUDIT_BIRD_WIDTH = 30;
export const AUDIT_BIRD_HEIGHT = 20;
/** Math.random() > 0.3 selects a cactus, otherwise a bird. */
export const AUDIT_RANDOM_BIRD_THRESHOLD = 0.3;

export const AUDIT_INITIAL_SPEED = 5;
export const AUDIT_SPEED_LEVEL_STEP = 0.5;
export const AUDIT_SCORE_PER_LEVEL = 500;

// --- Input / output types ---------------------------------------------------

export type ObstacleType = 'cactus' | 'bird';

export interface AuditDinoSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityY: number;
  isJumping: boolean;
}

export interface AuditObstacleSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
  type: ObstacleType;
}

export interface AuditFrameSnapshot {
  dino: AuditDinoSnapshot;
  obstacles: AuditObstacleSnapshot[];
  score: number;
  level: number;
  speed: number;
  frameCount: number;
  lastObstacleFrame: number;
}

export interface AuditFrameOptions {
  /**
   * The value that stands in for the frame's `Math.random()` draw. The source
   * game picks `'cactus'` when `random > 0.3`, otherwise `'bird'`.
   */
  randomValue: number;
  /**
   * Whether obstacle spawning is requested this frame. Mirrors the implicit
   * "always allowed" spawning inside `gameLoop`; callers can disable it to
   * audit a frame where spawning is suppressed.
   */
  spawnEnabled?: boolean;
}

export interface AuditCheck {
  name: string;
  passed: boolean;
  /** Human-readable reason when the check did not pass, otherwise null. */
  reason: string | null;
}

export interface AuditDinoResult {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityY: number;
  isJumping: boolean;
}

export interface AuditSpawnedObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  type: ObstacleType;
}

export interface AuditObstacleResult {
  /** `type` is null when the input snapshot did not carry a valid type. */
  type: ObstacleType | null;
  xBefore: number | null;
  /** x after moving left by `speed`, before any filtering. */
  xAfter: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  /** AABB collision against the post-gravity dino, exactly like checkCollision. */
  collided: boolean;
  /** Kept by the game's filter: no collision and `x + width > 0`. */
  retained: boolean;
}

export interface FrameAuditResult {
  /** False when the snapshot contained invalid fields; see `errors`. */
  degraded: boolean;
  /** Readable reasons for every invalid field that forced degradation. */
  errors: string[];
  /** Fields of the input snapshot that were invalid (dot-paths). */
  affectedFields: string[];
  dino: AuditDinoResult;
  landed: boolean;
  minGap: number;
  /** frameCount + 1 minus lastObstacleFrame. */
  gap: number;
  /** Whether the strict `gap > minGap` gate (plus spawnEnabled) was open. */
  spawnGateOpen: boolean;
  /** What the game would do on this frame, independent of spawnEnabled. */
  wouldSpawn: boolean;
  spawned: boolean;
  spawnedObstacle: AuditSpawnedObstacle | null;
  obstacles: AuditObstacleResult[];
  retainedObstacles: AuditObstacleResult[];
  score: number;
  level: number;
  speed: number;
  frameCount: number;
  lastObstacleFrame: number;
  checks: AuditCheck[];
}

// --- Small pure helpers ------------------------------------------------------

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dedupe(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

/**
 * The exact gap formula used by `gameLoop`:
 * `Math.max(80, 120 - level * 5)`.
 */
export function computeMinGap(level: number): number {
  return Math.max(80, 120 - level * 5);
}

/** The exact AABB test used by `checkCollision` in DinoGame.tsx. */
function aabbCollision(
  dino: AuditDinoResult,
  obstacle: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    dino.x < obstacle.x + obstacle.width &&
    dino.x + dino.width > obstacle.x &&
    dino.y < obstacle.y + obstacle.height &&
    dino.y + dino.height > obstacle.y
  );
}

function makeObstacle(type: ObstacleType, dinoHeight: number): AuditSpawnedObstacle {
  return {
    x: AUDIT_CANVAS_WIDTH,
    y:
      type === 'cactus'
        ? AUDIT_GROUND_Y + dinoHeight - AUDIT_CACTUS_HEIGHT
        : AUDIT_GROUND_Y - 20,
    width: type === 'cactus' ? AUDIT_CACTUS_WIDTH : AUDIT_BIRD_WIDTH,
    height: type === 'cactus' ? AUDIT_CACTUS_HEIGHT : AUDIT_BIRD_HEIGHT,
    type,
  };
}

interface ValidationIssue {
  field: string;
  reason: string;
}

interface NormalizedSnapshot {
  snapshot: AuditFrameSnapshot;
  issues: ValidationIssue[];
  invalidObstacleIndexes: Set<number>;
}

/**
 * Validates the snapshot without throwing. Invalid numeric scalar fields are
 * coerced to safe fallbacks so the frame can still be audited in a degraded
 * mode; non-finite obstacle geometry is preserved as null in the per-obstacle
 * output and the obstacle is excluded from collision/retention processing.
 */
function normalizeSnapshot(input: unknown): NormalizedSnapshot {
  const issues: ValidationIssue[] = [];
  const invalidObstacleIndexes = new Set<number>();

  const root = isRecord(input) ? input : {};
  if (!isRecord(input)) {
    issues.push({
      field: 'snapshot',
      reason: 'snapshot is not an object; an empty state was substituted',
    });
  }

  const rawDino = isRecord(root.dino) ? root.dino : {};
  if (!isRecord(root.dino)) {
    issues.push({
      field: 'dino',
      reason: 'dino is not an object; zeroed geometry was substituted',
    });
  }

  const numField = (
    source: Record<string, unknown>,
    field: string,
    fallback: number,
  ): number => {
    const value = source[field.split('.').slice(-1)[0]];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    issues.push({
      field,
      reason: `field ${field} must be a finite number (received ${String(value)})`,
    });
    return fallback;
  };

  const dino: AuditDinoSnapshot = {
    x: numField(rawDino, 'dino.x', 0),
    y: numField(rawDino, 'dino.y', AUDIT_GROUND_Y),
    width: numField(rawDino, 'dino.width', 0),
    height: numField(rawDino, 'dino.height', 0),
    velocityY: numField(rawDino, 'dino.velocityY', 0),
    isJumping: typeof rawDino.isJumping === 'boolean' ? rawDino.isJumping : false,
  };
  if (rawDino.isJumping !== undefined && typeof rawDino.isJumping !== 'boolean') {
    issues.push({
      field: 'dino.isJumping',
      reason: `field dino.isJumping must be a boolean (received ${String(rawDino.isJumping)})`,
    });
  }

  const score = numField(root, 'score', 0);
  const level = numField(root, 'level', 1);
  const speed = numField(root, 'speed', 0);
  const frameCount = numField(root, 'frameCount', 0);
  const lastObstacleFrame = numField(root, 'lastObstacleFrame', 0);

  const obstacles: AuditObstacleSnapshot[] = [];
  const rawObstacles = Array.isArray(root.obstacles) ? root.obstacles : [];
  if (!Array.isArray(root.obstacles)) {
    issues.push({
      field: 'obstacles',
      reason: 'obstacles is not an array; an empty obstacle list was substituted',
    });
  }

  rawObstacles.forEach((rawObstacle, index) => {
    const record = isRecord(rawObstacle) ? rawObstacle : {};
    if (!isRecord(rawObstacle)) {
      issues.push({
        field: `obstacles[${index}]`,
        reason: `obstacle at index ${index} is not an object`,
      });
      invalidObstacleIndexes.add(index);
    }

    const geometryFields = ['x', 'y', 'width', 'height'] as const;
    const geometry = {} as Record<(typeof geometryFields)[number], number>;
    geometryFields.forEach((field) => {
      const value = record[field];
      if (typeof value === 'number' && Number.isFinite(value)) {
        geometry[field] = value;
      } else {
        geometry[field] = Number.NaN;
        invalidObstacleIndexes.add(index);
        issues.push({
          field: `obstacles[${index}].${field}`,
          reason: `obstacle[${index}].${field} must be a finite number (received ${String(value)})`,
        });
      }
    });

    const typeValid = record.type === 'cactus' || record.type === 'bird';
    if (!typeValid) {
      issues.push({
        field: `obstacles[${index}].type`,
        reason: `obstacle[${index}].type must be 'cactus' or 'bird' (received ${String(record.type)})`,
      });
      invalidObstacleIndexes.add(index);
    }

    obstacles.push({
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      type: typeValid ? (record.type as ObstacleType) : 'cactus',
    });
  });

  return {
    snapshot: { dino, obstacles, score, level, speed, frameCount, lastObstacleFrame },
    issues,
    invalidObstacleIndexes,
  };
}

// --- Public entry point ------------------------------------------------------

/**
 * Audit a single game frame from a pure data snapshot.
 *
 * The returned object contains both the values the real `gameLoop` would
 * produce (post-gravity dino state, spawned obstacle, moved/colliding
 * obstacles, score/level/speed updates) and an ordered list of named checks.
 * Invalid input never escapes as an exception: the function returns a
 * `degraded` result with readable `errors` and `affectedFields`.
 */
export function auditFrame(
  snapshot: AuditFrameSnapshot,
  options: AuditFrameOptions,
): FrameAuditResult {
  try {
    return runAudit(snapshot, options);
  } catch (error) {
    // Last-resort safety net so malformed input can never throw to callers.
    return degradedShell(error);
  }
}

function runAudit(rawSnapshot: unknown, rawOptions: unknown): FrameAuditResult {
  const { snapshot, issues, invalidObstacleIndexes } = normalizeSnapshot(rawSnapshot);
  const optionRecord = isRecord(rawOptions) ? rawOptions : {};
  const options: AuditFrameOptions = {
    randomValue:
      typeof optionRecord.randomValue === 'number' &&
      Number.isFinite(optionRecord.randomValue)
        ? optionRecord.randomValue
        : 0,
    spawnEnabled:
      typeof optionRecord.spawnEnabled === 'boolean'
        ? optionRecord.spawnEnabled
        : true,
  };
  if (
    optionRecord.randomValue !== undefined &&
    (typeof optionRecord.randomValue !== 'number' ||
      !Number.isFinite(optionRecord.randomValue))
  ) {
    issues.push({
      field: 'options.randomValue',
      reason: `options.randomValue must be a finite number (received ${String(optionRecord.randomValue)}); 0 was used`,
    });
  }
  if (
    optionRecord.spawnEnabled !== undefined &&
    typeof optionRecord.spawnEnabled !== 'boolean'
  ) {
    issues.push({
      field: 'options.spawnEnabled',
      reason: `options.spawnEnabled must be a boolean (received ${String(optionRecord.spawnEnabled)}); true was used`,
    });
  }

  const { dino, obstacles, level, speed, frameCount, lastObstacleFrame } = snapshot;

  // Semantic validation on the normalized but still pre-frame state. These are
  // invariant violations rather than type/coercion failures, but they still
  // force a degraded audit so callers cannot mistake the frame for a clean one.
  if (!(dino.width > 0)) {
    issues.push({
      field: 'dino.width',
      reason: `dino width must be a positive number (received ${dino.width})`,
    });
  }
  if (!(dino.height > 0)) {
    issues.push({
      field: 'dino.height',
      reason: `dino height must be a positive number (received ${dino.height})`,
    });
  }
  if (!(speed > 0)) {
    issues.push({
      field: 'speed',
      reason: `speed must be positive but is ${speed}`,
    });
  }
  if (dino.y > AUDIT_GROUND_Y) {
    issues.push({
      field: 'dino.y',
      reason: `dino y (${dino.y}) is below GROUND_Y (${AUDIT_GROUND_Y})`,
    });
  }

  const degraded = issues.length > 0;
  const errors = dedupe(issues.map((issue) => issue.reason));
  const affectedFields = dedupe(issues.map((issue) => issue.field));

  // 1. Gravity, exactly as gameLoop applies it:
  //    velocityY += GRAVITY; y += velocityY; then clamp at GROUND_Y.
  const velocityYAfterGravity = dino.velocityY + AUDIT_GRAVITY;
  let yAfterGravity = dino.y + velocityYAfterGravity;
  let landed = false;
  let finalVelocityY = velocityYAfterGravity;
  let finalIsJumping = dino.isJumping;

  if (yAfterGravity >= AUDIT_GROUND_Y) {
    yAfterGravity = AUDIT_GROUND_Y;
    finalVelocityY = 0;
    finalIsJumping = false;
    landed = true;
  }

  const dinoResult: AuditDinoResult = {
    x: dino.x,
    y: yAfterGravity,
    width: dino.width,
    height: dino.height,
    velocityY: finalVelocityY,
    isJumping: finalIsJumping,
  };

  // 2. frameCount++ and the strict minGap spawn gate.
  const nextFrameCount = frameCount + 1;
  const minGap = computeMinGap(level);
  const gap = nextFrameCount - lastObstacleFrame;
  const gateOpen = gap > minGap;
  const wouldSpawn = gateOpen;
  const spawned = gateOpen && options.spawnEnabled === true;

  let spawnedObstacle: AuditSpawnedObstacle | null = null;
  if (spawned) {
    const obstacleType: ObstacleType =
      options.randomValue > AUDIT_RANDOM_BIRD_THRESHOLD ? 'cactus' : 'bird';
    spawnedObstacle = makeObstacle(obstacleType, dinoResult.height);
  }
  const nextLastObstacleFrame = spawned ? nextFrameCount : lastObstacleFrame;

  // 3. Every obstacle (including the freshly spawned one) moves left by speed,
  //    is collision-tested and filtered, mirroring gameLoop's filter callback.
  const obstacleResults: AuditObstacleResult[] = [];

  if (spawnedObstacle) {
    const spawnedXAfter = spawnedObstacle.x - speed;
    const spawnedCollided = aabbCollision(dinoResult, {
      x: spawnedXAfter,
      y: spawnedObstacle.y,
      width: spawnedObstacle.width,
      height: spawnedObstacle.height,
    });
    obstacleResults.push({
      type: spawnedObstacle.type,
      xBefore: spawnedObstacle.x,
      xAfter: spawnedXAfter,
      y: spawnedObstacle.y,
      width: spawnedObstacle.width,
      height: spawnedObstacle.height,
      collided: spawnedCollided,
      retained: !spawnedCollided && spawnedXAfter + spawnedObstacle.width > 0,
    });
  }

  obstacles.forEach((obstacle, index) => {
    const geometryInvalid = invalidObstacleIndexes.has(index);
    const typeValid = obstacle.type === 'cactus' || obstacle.type === 'bird';
    const xAfter = geometryInvalid ? null : obstacle.x - speed;

    let collided = false;
    if (!geometryInvalid) {
      collided = aabbCollision(dinoResult, {
        x: obstacle.x,
        y: obstacle.y,
        width: obstacle.width,
        height: obstacle.height,
      });
    }
    const retained =
      !geometryInvalid && !collided && obstacle.x + obstacle.width > 0;

    obstacleResults.push({
      type: typeValid ? obstacle.type : null,
      xBefore: finiteOrNull(obstacle.x),
      xAfter,
      y: finiteOrNull(obstacle.y),
      width: finiteOrNull(obstacle.width),
      height: finiteOrNull(obstacle.height),
      collided,
      retained,
    });
  });

  const retainedObstacles = obstacleResults.filter((obstacle) => obstacle.retained);

  // 4. score += 1 and the level/speed update from the new score.
  const nextScore = snapshot.score + 1;
  const newLevel = Math.floor(nextScore / AUDIT_SCORE_PER_LEVEL) + 1;
  let nextLevel = level;
  let nextSpeed = speed;
  if (newLevel > level) {
    nextLevel = newLevel;
    nextSpeed = AUDIT_INITIAL_SPEED + (newLevel - 1) * AUDIT_SPEED_LEVEL_STEP;
  }

  const checks = buildChecks({
    affectedFields,
    dino: dinoResult,
    inputDinoY: dino.y,
    inputVelocityY: dino.velocityY,
    landed,
    speed: nextSpeed,
    level: nextLevel,
    frameCount: nextFrameCount,
    previousFrameCount: frameCount,
    spawned,
    wouldSpawn,
    spawnedObstacle,
    minGap,
    gap,
    obstacleResults,
  });

  return {
    degraded,
    errors,
    affectedFields,
    dino: dinoResult,
    landed,
    minGap,
    gap,
    spawnGateOpen: gateOpen,
    wouldSpawn,
    spawned,
    spawnedObstacle,
    obstacles: obstacleResults,
    retainedObstacles,
    score: nextScore,
    level: nextLevel,
    speed: nextSpeed,
    frameCount: nextFrameCount,
    lastObstacleFrame: nextLastObstacleFrame,
    checks,
  };
}

interface CheckContext {
  affectedFields: string[];
  dino: AuditDinoResult;
  inputDinoY: number;
  inputVelocityY: number;
  landed: boolean;
  speed: number;
  level: number;
  frameCount: number;
  previousFrameCount: number;
  spawned: boolean;
  wouldSpawn: boolean;
  spawnedObstacle: AuditSpawnedObstacle | null;
  minGap: number;
  gap: number;
  obstacleResults: AuditObstacleResult[];
}

function buildChecks(context: CheckContext): AuditCheck[] {
  const checks: AuditCheck[] = [];

  // 1. Dino geometry must have positive width and height.
  const geometryFieldsAffected = context.affectedFields.some(
    (field) => field === 'dino.width' || field === 'dino.height',
  );
  const dimensionsPositive = context.dino.width > 0 && context.dino.height > 0;
  checks.push({
    name: 'dino-dimensions-positive',
    passed: dimensionsPositive,
    reason: dimensionsPositive
      ? null
      : `dino width (${context.dino.width}) and height (${context.dino.height}) must both be positive${
          geometryFieldsAffected ? '; non-finite input was coerced' : ''
        }`,
  });

  // 2. Speed must be positive.
  checks.push({
    name: 'speed-positive',
    passed: context.speed > 0,
    reason:
      context.speed > 0
        ? null
        : `speed must be positive but is ${context.speed}`,
  });

  // 3. All obstacle geometry must be finite numbers.
  const invalidGeometryFields = context.affectedFields.filter((field) =>
    field.startsWith('obstacles['),
  );
  checks.push({
    name: 'obstacle-coordinates-finite',
    passed: invalidGeometryFields.length === 0,
    reason:
      invalidGeometryFields.length === 0
        ? null
        : `non-finite obstacle geometry in fields: ${invalidGeometryFields.join(', ')}`,
  });

  // 4. The dino must not sink below the ground: the snapshot y may never
  //    exceed GROUND_Y (the output y is always clamped back to GROUND_Y).
  const groundOk = context.inputDinoY <= AUDIT_GROUND_Y;
  checks.push({
    name: 'dino-y-not-below-ground',
    passed: groundOk,
    reason: groundOk
      ? null
      : `dino y (${context.inputDinoY}) is below GROUND_Y (${AUDIT_GROUND_Y})`,
  });

  // 5. Gravity/landing mechanics must match gameLoop: while airborne the
  //    velocity is input velocity + GRAVITY; on landing y clamps to GROUND_Y,
  //    velocity resets to 0 and isJumping clears.
  const gravityConsistent = context.landed
    ? context.dino.y === AUDIT_GROUND_Y &&
      context.dino.velocityY === 0 &&
      context.dino.isJumping === false
    : context.dino.velocityY === context.inputVelocityY + AUDIT_GRAVITY &&
      context.dino.y < AUDIT_GROUND_Y;
  checks.push({
    name: 'gravity-and-landing-consistent',
    passed: gravityConsistent,
    reason: gravityConsistent
      ? null
      : 'post-gravity dino state does not match the gameLoop gravity/landing rules',
  });

  // 6. A spawned obstacle must enter at the right canvas edge.
  const spawnXOk =
    !context.spawned || context.spawnedObstacle?.x === AUDIT_CANVAS_WIDTH;
  checks.push({
    name: 'spawned-obstacle-x-is-canvas-width',
    passed: spawnXOk,
    reason: spawnXOk
      ? null
      : `spawned obstacle x (${context.spawnedObstacle?.x}) must equal canvas width (${AUDIT_CANVAS_WIDTH})`,
  });

  // 7. Birds always fly above cacti (canonical y positions for this frame),
  //    and an actually spawned bird must sit at the canonical bird y.
  const canonicalCactusY = AUDIT_GROUND_Y + context.dino.height - AUDIT_CACTUS_HEIGHT;
  const canonicalBirdY = AUDIT_GROUND_Y - 20;
  const birdAboveCactus = canonicalBirdY < canonicalCactusY;
  const spawnedBirdOk =
    context.spawnedObstacle === null ||
    context.spawnedObstacle.type !== 'bird' ||
    context.spawnedObstacle.y === canonicalBirdY;
  const birdCheckOk = birdAboveCactus && spawnedBirdOk;
  checks.push({
    name: 'bird-y-above-cactus-y',
    passed: birdCheckOk,
    reason: birdCheckOk
      ? null
      : `bird y (${canonicalBirdY}) must be above cactus y (${canonicalCactusY})`,
  });

  // 8. Speed must equal 5 + (level - 1) * 0.5.
  const expectedSpeed =
    AUDIT_INITIAL_SPEED + (context.level - 1) * AUDIT_SPEED_LEVEL_STEP;
  const speedFormulaOk = context.speed === expectedSpeed;
  checks.push({
    name: 'speed-matches-level-formula',
    passed: speedFormulaOk,
    reason: speedFormulaOk
      ? null
      : `speed (${context.speed}) must equal 5 + (level - 1) * 0.5 = ${expectedSpeed} at level ${context.level}`,
  });

  // 9. frameCount must increment by exactly one.
  const frameIncrementOk = context.frameCount === context.previousFrameCount + 1;
  checks.push({
    name: 'frame-count-incremented',
    passed: frameIncrementOk,
    reason: frameIncrementOk
      ? null
      : `frameCount (${context.frameCount}) must equal previous frameCount + 1 (${context.previousFrameCount + 1})`,
  });

  // 10. Spawning uses the strict `gap > minGap` semantics (equality never spawns).
  const gateConsistent = context.wouldSpawn === (context.gap > context.minGap);
  checks.push({
    name: 'spawn-gate-strict-min-gap',
    passed: gateConsistent,
    reason: gateConsistent
      ? null
      : `spawn decision (${context.wouldSpawn}) must equal strict gap (${context.gap}) > minGap (${context.minGap})`,
  });

  // 11. Retained obstacles are, by construction, exactly the non-colliding
  //     ones still visible on screen.
  const retentionOk = context.obstacleResults.every(
    (obstacle) =>
      !obstacle.retained ||
      (!obstacle.collided &&
        (obstacle.xAfter ?? Number.NEGATIVE_INFINITY) + (obstacle.width ?? 0) > 0),
  );
  checks.push({
    name: 'retained-obstacles-collision-free',
    passed: retentionOk,
    reason: retentionOk
      ? null
      : 'a retained obstacle was colliding or already fully off-screen',
  });

  return checks;
}

function failedCheck(name: string, detail: string): AuditCheck {
  return { name, passed: false, reason: detail };
}

function degradedShell(error: unknown): FrameAuditResult {
  const reason = `audit aborted before completion: ${
    error instanceof Error ? error.message : String(error)
  }`;
  return {
    degraded: true,
    errors: [reason],
    affectedFields: ['snapshot'],
    dino: {
      x: 0,
      y: AUDIT_GROUND_Y,
      width: 0,
      height: 0,
      velocityY: 0,
      isJumping: false,
    },
    landed: false,
    minGap: computeMinGap(1),
    gap: 0,
    spawnGateOpen: false,
    wouldSpawn: false,
    spawned: false,
    spawnedObstacle: null,
    obstacles: [],
    retainedObstacles: [],
    score: 0,
    level: 1,
    speed: 0,
    frameCount: 0,
    lastObstacleFrame: 0,
    checks: [
      failedCheck('dino-dimensions-positive', reason),
      failedCheck('speed-positive', reason),
      failedCheck('obstacle-coordinates-finite', reason),
      failedCheck('dino-y-not-below-ground', reason),
      failedCheck('gravity-and-landing-consistent', reason),
      failedCheck('spawned-obstacle-x-is-canvas-width', reason),
      failedCheck('bird-y-above-cactus-y', reason),
      failedCheck('speed-matches-level-formula', reason),
      failedCheck('frame-count-incremented', reason),
      failedCheck('spawn-gate-strict-min-gap', reason),
      failedCheck('retained-obstacles-collision-free', reason),
    ],
  };
}
