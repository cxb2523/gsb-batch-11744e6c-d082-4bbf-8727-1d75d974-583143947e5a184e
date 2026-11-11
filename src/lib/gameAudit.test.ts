import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIT_CANVAS_WIDTH,
  AUDIT_GRAVITY,
  AUDIT_GROUND_Y,
  auditFrame,
  computeMinGap,
  type AuditFrameSnapshot,
  type FrameAuditResult,
} from './gameAudit.ts';

/**
 * Independent hand calculation of one gameLoop frame. This intentionally does
 * not call into gameAudit helpers (other than the shared minGap formula, which
 * the task requires to be reused rather than re-derived) so the test verifies
 * the module against the rules as transcribed from DinoGame.tsx.
 */
function expectedFrame(
  snapshot: AuditFrameSnapshot,
  randomValue: number,
  spawnEnabled: boolean,
): {
  dinoY: number;
  velocityY: number;
  landed: boolean;
  isJumping: boolean;
  frameCount: number;
  minGap: number;
  gap: number;
  spawned: boolean;
  lastObstacleFrame: number;
  score: number;
  level: number;
  speed: number;
  movedX: Array<number | null>;
  collisions: boolean[];
} {
  const dino = { ...snapshot.dino };

  // Gravity + landing clamp (DinoGame.tsx lines 134-141).
  const velocityYAfterGravity = dino.velocityY + AUDIT_GRAVITY;
  let yAfter = dino.y + velocityYAfterGravity;
  let landed = false;
  let velocityY = velocityYAfterGravity;
  if (yAfter >= AUDIT_GROUND_Y) {
    yAfter = AUDIT_GROUND_Y;
    velocityY = 0;
    dino.isJumping = false;
    landed = true;
  }

  // frameCount++ then strict minGap gate (lines 145-159).
  const frameCount = snapshot.frameCount + 1;
  const minGap = computeMinGap(snapshot.level);
  const gap = frameCount - snapshot.lastObstacleFrame;
  const spawned = gap > minGap && spawnEnabled;
  const lastObstacleFrame = spawned ? frameCount : snapshot.lastObstacleFrame;

  // Replay the obstacle pipeline (lines 161-173): spawned obstacle first.
  const working = snapshot.obstacles.map((obstacle) => ({ ...obstacle }));
  if (spawned) {
    const type = randomValue > 0.3 ? 'cactus' : 'bird';
    working.unshift({
      x: AUDIT_CANVAS_WIDTH,
      y: type === 'cactus' ? AUDIT_GROUND_Y + dino.height - 40 : AUDIT_GROUND_Y - 20,
      width: type === 'cactus' ? 20 : 30,
      height: type === 'cactus' ? 40 : 20,
      type,
    });
  }

  const movedX: Array<number | null> = [];
  const collisions: boolean[] = [];
  for (const obstacle of working) {
    const xAfter = obstacle.x - snapshot.speed;
    movedX.push(xAfter);
    const collided =
      dino.x < xAfter + obstacle.width &&
      dino.x + dino.width > xAfter &&
      yAfter < obstacle.y + obstacle.height &&
      yAfter + dino.height > obstacle.y;
    collisions.push(collided);
  }

  // Score + level update (lines 175-181).
  const score = snapshot.score + 1;
  const candidateLevel = Math.floor(score / 500) + 1;
  const level = candidateLevel > snapshot.level ? candidateLevel : snapshot.level;
  const speed =
    candidateLevel > snapshot.level
      ? 5 + (candidateLevel - 1) * 0.5
      : snapshot.speed;

  return {
    dinoY: yAfter,
    velocityY,
    landed,
    isJumping: dino.isJumping,
    frameCount,
    minGap,
    gap,
    spawned,
    lastObstacleFrame,
    score,
    level,
    speed,
    movedX,
    collisions,
  };
}

function assertAllChecksPass(result: FrameAuditResult): void {
  const failed = result.checks.filter((check) => !check.passed);
  assert.deepEqual(
    failed,
    [],
    `expected every check to pass, failing checks: ${failed
      .map((check) => `${check.name} (${check.reason})`)
      .join('; ')}`,
  );
}

function baseSnapshot(overrides: Partial<AuditFrameSnapshot> = {}): AuditFrameSnapshot {
  return {
    dino: {
      x: 50,
      y: 100,
      width: 40,
      height: 50,
      velocityY: -5,
      isJumping: true,
    },
    obstacles: [],
    score: 0,
    level: 1,
    speed: 5,
    frameCount: 0,
    lastObstacleFrame: 0,
    ...overrides,
  };
}

describe('auditFrame - normal path', () => {
  it('airborne dino, strict gap beyond minGap, cactus spawn matches hand calculation', () => {
    // level 1 -> minGap = max(80, 120 - 5) = 115. frame 117 gives gap 117 > 115.
    const snapshot = baseSnapshot({ frameCount: 116, lastObstacleFrame: 0 });
    const randomValue = 0.5; // > 0.3 -> cactus

    const result = auditFrame(snapshot, { randomValue });
    const expected = expectedFrame(snapshot, randomValue, true);

    assert.equal(result.degraded, false);
    assertAllChecksPass(result);

    // Gravity: -5 + 0.8 = -4.2; y = 100 + (-4.2) = 95.8, still airborne.
    assert.equal(result.dino.velocityY, expected.velocityY);
    assert.equal(result.dino.velocityY, -4.2);
    assert.equal(result.dino.y, expected.dinoY);
    assert.equal(result.dino.y, 95.8);
    assert.equal(result.landed, false);
    assert.equal(result.landed, expected.landed);
    assert.equal(result.dino.isJumping, true);

    // Spawn gate and minGap reuse.
    assert.equal(result.minGap, 115);
    assert.equal(result.minGap, expected.minGap);
    assert.equal(result.gap, 117);
    assert.equal(result.spawnGateOpen, true);
    assert.equal(result.wouldSpawn, true);
    assert.equal(result.spawned, true);
    assert.equal(result.spawned, expected.spawned);
    assert.equal(result.lastObstacleFrame, 117);
    assert.equal(result.lastObstacleFrame, expected.lastObstacleFrame);

    // Spawned cactus fields, exactly as gameLoop builds them.
    assert.ok(result.spawnedObstacle);
    assert.equal(result.spawnedObstacle.type, 'cactus');
    assert.equal(result.spawnedObstacle.x, AUDIT_CANVAS_WIDTH);
    assert.equal(result.spawnedObstacle.y, AUDIT_GROUND_Y + 50 - 40); // 260
    assert.equal(result.spawnedObstacle.width, 20);
    assert.equal(result.spawnedObstacle.height, 40);

    // Movement and collision: 800 - 5 = 795, nowhere near the dino.
    assert.equal(result.obstacles.length, 1);
    assert.equal(result.obstacles[0].xAfter, expected.movedX[0]);
    assert.equal(result.obstacles[0].xAfter, 795);
    assert.equal(result.obstacles[0].collided, false);
    assert.equal(result.obstacles[0].collided, expected.collisions[0]);
    assert.equal(result.obstacles[0].retained, true);
    assert.equal(result.retainedObstacles.length, 1);

    // Score/level/speed bookkeeping.
    assert.equal(result.frameCount, expected.frameCount);
    assert.equal(result.score, 1);
    assert.equal(result.level, 1);
    assert.equal(result.speed, 5);
    assert.equal(result.speed, expected.speed);
  });

  it('spawns a bird with bird geometry when randomValue <= 0.3, bird above cactus', () => {
    const snapshot = baseSnapshot({ frameCount: 200, lastObstacleFrame: 0 });
    const randomValue = 0.2; // <= 0.3 -> bird

    const result = auditFrame(snapshot, { randomValue });
    const expected = expectedFrame(snapshot, randomValue, true);

    assert.equal(result.degraded, false);
    assertAllChecksPass(result);
    assert.ok(result.spawnedObstacle);
    assert.equal(result.spawnedObstacle.type, 'bird');
    assert.equal(result.spawnedObstacle.x, AUDIT_CANVAS_WIDTH);
    assert.equal(result.spawnedObstacle.y, AUDIT_GROUND_Y - 20); // 230
    assert.equal(result.spawnedObstacle.width, 30);
    assert.equal(result.spawnedObstacle.height, 20);
    assert.ok(
      result.spawnedObstacle.y < AUDIT_GROUND_Y + snapshot.dino.height - 40,
      'bird y must be higher (smaller) than cactus y',
    );
    assert.equal(result.obstacles[0].xAfter, expected.movedX[0]);
    assert.equal(result.obstacles[0].collided, expected.collisions[0]);
  });

  it('detects an AABB collision and drops the colliding obstacle from the retained list', () => {
    // Grounded dino at GROUND_Y (250), 40x50. Cactus overlaps after moving.
    const snapshot = baseSnapshot({
      dino: { x: 50, y: AUDIT_GROUND_Y, width: 40, height: 50, velocityY: 0, isJumping: false },
      obstacles: [
        // x = 75: after -5 -> 70; dino spans x 50..90, cactus spans 70..90 -> overlap.
        { x: 75, y: AUDIT_GROUND_Y + 50 - 40, width: 20, height: 40, type: 'cactus' },
      ],
      frameCount: 10,
      lastObstacleFrame: 0,
    });

    const result = auditFrame(snapshot, { randomValue: 0.99, spawnEnabled: false });
    const expected = expectedFrame(snapshot, 0.99, false);

    assert.equal(result.landed, true);
    assert.equal(result.dino.y, AUDIT_GROUND_Y);
    assert.equal(result.dino.velocityY, 0);
    assert.equal(result.dino.isJumping, false);
    assert.equal(result.obstacles.length, 1);
    assert.equal(result.obstacles[0].xAfter, 70);
    assert.equal(result.obstacles[0].xAfter, expected.movedX[0]);
    assert.equal(result.obstacles[0].collided, true);
    assert.equal(result.obstacles[0].collided, expected.collisions[0]);
    assert.equal(result.obstacles[0].retained, false);
    assert.equal(result.retainedObstacles.length, 0);
    assert.equal(result.spawned, false);
    assertAllChecksPass(result);
  });

  it('keeps non-colliding on-screen obstacles and removes off-screen ones', () => {
    const snapshot = baseSnapshot({
      obstacles: [
        { x: 400, y: AUDIT_GROUND_Y + 10, width: 20, height: 40, type: 'cactus' },
        // Fully off-screen after the move: -25 + 20 = -5 <= 0.
        { x: -25, y: AUDIT_GROUND_Y + 10, width: 20, height: 40, type: 'cactus' },
      ],
      frameCount: 5,
      lastObstacleFrame: 0,
    });

    const result = auditFrame(snapshot, { randomValue: 0.9, spawnEnabled: false });
    assert.equal(result.spawned, false);
    assert.equal(result.obstacles.length, 2);
    assert.equal(result.obstacles[0].xAfter, 395);
    assert.equal(result.obstacles[0].retained, true);
    assert.equal(result.obstacles[1].xAfter, -30);
    assert.equal(result.obstacles[1].retained, false);
    assert.equal(result.retainedObstacles.length, 1);
    assertAllChecksPass(result);
  });
});

describe('auditFrame - boundary minGap semantics', () => {
  it('does NOT spawn when frameCount - lastObstacleFrame equals minGap exactly', () => {
    // level 1 -> minGap 115. next frameCount = 115, lastObstacleFrame 0 -> gap 115.
    const snapshot = baseSnapshot({ frameCount: 114, lastObstacleFrame: 0 });
    const result = auditFrame(snapshot, { randomValue: 0.5 });
    const expected = expectedFrame(snapshot, 0.5, true);

    assert.equal(result.minGap, 115);
    assert.equal(result.gap, 115);
    assert.equal(result.spawnGateOpen, false);
    assert.equal(result.wouldSpawn, false);
    assert.equal(result.spawned, false);
    assert.equal(result.spawned, expected.spawned);
    assert.equal(result.spawnedObstacle, null);
    assert.equal(result.lastObstacleFrame, 0);
    assertAllChecksPass(result);
  });

  it('spawns when the gap is exactly minGap + 1', () => {
    // next frameCount = 116 -> gap 116 = 115 + 1, strictly greater -> spawn.
    const snapshot = baseSnapshot({ frameCount: 115, lastObstacleFrame: 0 });
    const result = auditFrame(snapshot, { randomValue: 0.5 });
    const expected = expectedFrame(snapshot, 0.5, true);

    assert.equal(result.gap, 116);
    assert.equal(result.spawnGateOpen, true);
    assert.equal(result.wouldSpawn, true);
    assert.equal(result.spawned, true);
    assert.equal(result.spawned, expected.spawned);
    assert.ok(result.spawnedObstacle);
    assert.equal(result.lastObstacleFrame, 116);
    assertAllChecksPass(result);
  });

  it('reuses the minGap formula across levels, including the 80 floor', () => {
    assert.equal(computeMinGap(1), 115);
    assert.equal(computeMinGap(2), 110);
    assert.equal(computeMinGap(7), 85);
    assert.equal(computeMinGap(8), 80);
    assert.equal(computeMinGap(9), 80); // clamped by Math.max(80, ...)

    // level 9 -> minGap 80; gap of 80 exactly must not spawn.
    const atBoundary = baseSnapshot({
      level: 9,
      speed: 9,
      frameCount: 179,
      lastObstacleFrame: 100,
    });
    const boundaryResult = auditFrame(atBoundary, { randomValue: 0.5 });
    assert.equal(boundaryResult.minGap, 80);
    assert.equal(boundaryResult.gap, 80);
    assert.equal(boundaryResult.spawned, false);

    // gap 81 -> spawns.
    const beyond = baseSnapshot({
      level: 9,
      speed: 9,
      frameCount: 180,
      lastObstacleFrame: 100,
    });
    const beyondResult = auditFrame(beyond, { randomValue: 0.5 });
    assert.equal(beyondResult.gap, 81);
    assert.equal(beyondResult.spawned, true);
  });
});

describe('auditFrame - level crossing', () => {
  it('levels up exactly when score crosses a multiple of 500 and applies the speed formula', () => {
    // score 499 -> next score 500 -> floor(500/500)+1 = level 2 -> speed 5.5.
    const snapshot = baseSnapshot({ score: 499, level: 1, speed: 5 });
    const result = auditFrame(snapshot, { randomValue: 0.9, spawnEnabled: false });
    const expected = expectedFrame(snapshot, 0.9, false);

    assert.equal(result.score, 500);
    assert.equal(result.level, 2);
    assert.equal(result.level, expected.level);
    assert.equal(result.speed, 5.5);
    assert.equal(result.speed, expected.speed);
    assert.equal(result.speed, 5 + (2 - 1) * 0.5);
    assertAllChecksPass(result);
  });

  it('does not level up before the boundary and keeps the previous speed', () => {
    // score 498 -> next score 499 -> still level 1, speed unchanged.
    const snapshot = baseSnapshot({ score: 498, level: 1, speed: 5 });
    const result = auditFrame(snapshot, { randomValue: 0.9, spawnEnabled: false });

    assert.equal(result.score, 499);
    assert.equal(result.level, 1);
    assert.equal(result.speed, 5);
    assertAllChecksPass(result);
  });

  it('handles a later multiple-of-500 crossing with the same formula', () => {
    // score 999 -> 1000 -> level 3 -> speed 6.
    const snapshot = baseSnapshot({ score: 999, level: 2, speed: 5.5 });
    const result = auditFrame(snapshot, { randomValue: 0.9, spawnEnabled: false });

    assert.equal(result.score, 1000);
    assert.equal(result.level, 3);
    assert.equal(result.speed, 6);
    assert.equal(result.speed, 5 + (3 - 1) * 0.5);
    assertAllChecksPass(result);
  });
});

describe('auditFrame - degraded / negative paths', () => {
  it('returns a degraded result when the dino y is below GROUND_Y, without throwing', () => {
    const snapshot = baseSnapshot({
      dino: { x: 50, y: AUDIT_GROUND_Y + 10, width: 40, height: 50, velocityY: 0, isJumping: true },
    });

    const result = auditFrame(snapshot, { randomValue: 0.5 });
    assert.equal(result.degraded, true);
    assert.ok(result.errors.some((reason) => reason.includes('GROUND_Y')));
    assert.ok(result.affectedFields.includes('dino.y'));

    const groundCheck = result.checks.find((check) => check.name === 'dino-y-not-below-ground');
    assert.ok(groundCheck);
    assert.equal(groundCheck.passed, false);
    assert.ok(groundCheck.reason && groundCheck.reason.includes('GROUND_Y'));

    // The frame still audited deterministically: landing clamp fires.
    assert.equal(result.dino.y, AUDIT_GROUND_Y);
    assert.equal(result.landed, true);
    // Other invariant checks remain green.
    assert.equal(
      result.checks.find((check) => check.name === 'frame-count-incremented')?.passed,
      true,
    );
  });

  it('returns a degraded result when speed is zero and flags the speed checks', () => {
    const snapshot = baseSnapshot({ speed: 0, frameCount: 5 });
    const result = auditFrame(snapshot, { randomValue: 0.5 });

    assert.equal(result.degraded, true);
    assert.ok(result.affectedFields.includes('speed'));
    assert.ok(result.errors.some((reason) => reason.includes('speed')));

    const positiveCheck = result.checks.find((check) => check.name === 'speed-positive');
    const formulaCheck = result.checks.find((check) => check.name === 'speed-matches-level-formula');
    assert.ok(positiveCheck && formulaCheck);
    assert.equal(positiveCheck.passed, false);
    assert.equal(formulaCheck.passed, false);
    assert.ok(positiveCheck.reason && positiveCheck.reason.includes('positive'));

    // Zero speed means obstacles do not move.
    assert.equal(result.speed, 0);
  });

  it('does not throw on non-finite obstacle coordinates and marks the affected fields', () => {
    const snapshot = baseSnapshot({
      obstacles: [
        { x: Number.POSITIVE_INFINITY, y: Number.NaN, width: 20, height: 40, type: 'cactus' },
      ],
    });

    const result = auditFrame(snapshot, { randomValue: 0.5 });
    assert.equal(result.degraded, true);
    for (const field of ['obstacles[0].x', 'obstacles[0].y']) {
      assert.ok(result.affectedFields.includes(field), `missing affected field ${field}`);
    }
    assert.ok(
      result.errors.every((reason) => typeof reason === 'string' && reason.length > 0),
      'every degradation reason must be readable text',
    );

    const finiteCheck = result.checks.find(
      (check) => check.name === 'obstacle-coordinates-finite',
    );
    assert.ok(finiteCheck);
    assert.equal(finiteCheck.passed, false);

    // Non-finite geometry is surfaced as null, never treated as a collision.
    assert.equal(result.obstacles[0].xAfter, null);
    assert.equal(result.obstacles[0].y, null);
    assert.equal(result.obstacles[0].collided, false);
    assert.equal(result.obstacles[0].retained, false);
  });

  it('never throws on malformed top-level input and returns a degraded shell', () => {
    const result = auditFrame(null as unknown as AuditFrameSnapshot, {
      randomValue: 0.5,
    });
    assert.equal(result.degraded, true);
    assert.ok(result.affectedFields.includes('snapshot'));
    assert.equal(Array.isArray(result.checks), true);
    assert.ok(result.checks.length > 0);
  });

  it('degrades when dino width/height are non-positive', () => {
    const snapshot = baseSnapshot({
      dino: { x: 50, y: 100, width: 0, height: -5, velocityY: -5, isJumping: true },
    });
    const result = auditFrame(snapshot, { randomValue: 0.5 });
    const dimensionsCheck = result.checks.find(
      (check) => check.name === 'dino-dimensions-positive',
    );
    assert.ok(dimensionsCheck);
    assert.equal(dimensionsCheck.passed, false);
    assert.ok(dimensionsCheck.reason && dimensionsCheck.reason.includes('positive'));
  });
});

describe('auditFrame - JSON serializability', () => {
  it('round-trips a normal audit result through JSON.stringify/parse', () => {
    const snapshot = baseSnapshot({ frameCount: 116 });
    const result = auditFrame(snapshot, { randomValue: 0.5 });

    const json = JSON.stringify(result);
    assert.equal(typeof json, 'string');
    const parsed = JSON.parse(json) as FrameAuditResult;
    assert.deepEqual(parsed, result);

    // No functions or class instances survive serialization.
    assert.equal(typeof parsed, 'object');
    assert.equal(parsed.spawnedObstacle?.type, 'cactus');
    assert.equal(Array.isArray(parsed.checks), true);
    for (const check of parsed.checks) {
      assert.equal(typeof check.name, 'string');
      assert.equal(typeof check.passed, 'boolean');
      assert.ok(check.reason === null || typeof check.reason === 'string');
    }
  });

  it('round-trips a degraded result containing non-finite input (coerced to null)', () => {
    const snapshot = baseSnapshot({
      obstacles: [
        { x: Number.NaN, y: 260, width: 20, height: 40, type: 'cactus' },
      ],
    });
    const result = auditFrame(snapshot, { randomValue: 0.5 });
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json) as FrameAuditResult;
    assert.equal(parsed.degraded, true);
    assert.equal(parsed.obstacles[0].xBefore, null);
    assert.equal(parsed.obstacles[0].xAfter, null);
    assert.deepEqual(parsed, JSON.parse(JSON.stringify(result)));
  });
});
