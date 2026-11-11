import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  auditMeshBlitBatch,
  type MeshBlitAuditInput,
  type MeshBlitAuditJob,
} from '../src/meshBlitAudit.js';

/**
 * The mesh rasterization audit (src/meshBlitAudit.ts) rehearses
 * MeshGlBlitter.flush()'s batching decisions from a plain-data snapshot — no
 * WebGL, no DOM, no GPU. These fixtures are synthetic snapshots; the expected
 * pass/tile/fallback verdicts are hand-derived from the blitter's own rules
 * (GUTTER 1, GROW_STEP 256, ALIGN 32, shelf-packing tallest first).
 */

function job(over: Partial<MeshBlitAuditJob> = {}): MeshBlitAuditJob {
  return {
    canvasWidth: 100,
    canvasHeight: 80,
    page: 'page-a',
    pma: true,
    vertexCount: 4,
    triangleCount: 2,
    ratio: 1,
    width: 100,
    height: 80,
    ...over,
  };
}

function input(over: Partial<MeshBlitAuditInput> = {}): MeshBlitAuditInput {
  return {
    context: { available: true, lost: false },
    buffer: {
      width: 1024,
      height: 1024,
      grantedWidth: 1024,
      grantedHeight: 1024,
      maxSize: 4096,
      refusedArea: null,
      testLimits: { area: null, width: null, height: null, tiling: true },
    },
    jobs: [],
    ...over,
  };
}

test('normal path: small jobs in a fully granted buffer audit as one pass, every job in pass 0', () => {
  const audit = auditMeshBlitBatch(
    input({
      jobs: [
        job({ page: 'page-a', pma: true, width: 100, height: 80 }),
        job({ page: 'page-a', pma: true, width: 200, height: 50 }),
        job({ page: 'page-b', pma: false, width: 64, height: 64 }),
      ],
    }),
  );
  assert.equal(audit.mode, 'single-pass');
  assert.equal(audit.fallback, null);
  assert.equal(audit.fallbackReason, null);
  assert.equal(audit.passes, 1);
  assert.equal(audit.pieces, 3);
  assert.equal(audit.tiledJobs, 0);
  assert.deepEqual(
    audit.jobs.map((j) => [j.pass, j.tiled, j.tiles, j.placed, j.reason]),
    [
      [0, false, 1, true, null],
      [0, false, 1, true, null],
      [0, false, 1, true, null],
    ],
  );
  // No growth was needed: the held buffer already fits the batch.
  assert.deepEqual(audit.buffer, {
    width: 1024,
    height: 1024,
    grew: false,
    growthAttempted: false,
    growthRefused: false,
  });
  // Two jobs share page-a under one pma: one upload. page-b is its own upload.
  assert.deepEqual(audit.pages, [
    { page: 'page-a', users: 2, uploads: 1, reuploads: 0, pmaConflict: false },
    { page: 'page-b', users: 1, uploads: 1, reuploads: 0, pmaConflict: false },
  ]);
  assert.equal(audit.vertexFloats, 3 * 2 * 3 * 4);
});

test('negative path: a lost context falls back to canvas2d with a reason, never a size decision', () => {
  const audit = auditMeshBlitBatch(
    input({
      context: { available: true, lost: true },
      jobs: [job(), job({ page: 'page-b', pma: false })],
    }),
  );
  assert.equal(audit.mode, 'fallback');
  assert.equal(audit.fallback, 'canvas2d');
  assert.match(audit.fallbackReason ?? '', /context is lost/);
  assert.equal(audit.passes, 0);
  for (const j of audit.jobs) {
    assert.equal(j.placed, false);
    assert.equal(j.pass, -1);
    assert.match(j.reason ?? '', /context is lost/);
  }
  // The fallback binds nothing, so no uploads are expected.
  assert.deepEqual(audit.pages.map((p) => p.uploads), [0, 0]);
});

test('negative path: WebGL unavailable falls back to canvas2d with a reason', () => {
  const audit = auditMeshBlitBatch(input({ context: { available: false, lost: false }, jobs: [job()] }));
  assert.equal(audit.mode, 'fallback');
  assert.equal(audit.fallback, 'canvas2d');
  assert.match(audit.fallbackReason ?? '', /unavailable/);
});

test('negative path: a job past maxSize is tiled, never a fallback', () => {
  const audit = auditMeshBlitBatch(
    input({
      jobs: [job({ width: 5000, height: 100 })],
    }),
  );
  assert.equal(audit.mode, 'tiled');
  assert.equal(audit.fallback, null);
  assert.equal(audit.fallbackReason, null);
  const [j] = audit.jobs;
  assert.equal(j.placed, true);
  assert.equal(j.tiled, true);
  // The buffer grows to its 4096 limit; the 5000-wide job is cut into
  // maxSize windows and tile columns: 4064 + 32 of the first window, 904 of
  // the second — three tiles, all in one pass.
  assert.equal(j.tiles, 3);
  assert.equal(j.pass, 0);
  assert.equal(audit.passes, 1);
  assert.deepEqual(audit.buffer, {
    width: 4096,
    height: 1024,
    grew: true,
    growthAttempted: true,
    growthRefused: false,
  });
});

test('boundary: a recorded refusal area declines every growth at or above it, and the batch goes through passes', () => {
  // Three 400×400 jobs in a 512×512 buffer: the packing needs 512×1280, and
  // every growth from 512×512 up (512×768 = 393216, 512×1024, 512×1280) meets
  // the recorded refusal of 300000 — so none is attempted and the batch is
  // drawn one job per pass through the buffer already held.
  const audit = auditMeshBlitBatch(
    input({
      buffer: {
        width: 512,
        height: 512,
        grantedWidth: 512,
        grantedHeight: 512,
        maxSize: 4096,
        refusedArea: 300000,
        testLimits: { area: null, width: null, height: null, tiling: true },
      },
      jobs: [job({ width: 400, height: 400 }), job({ width: 400, height: 400 }), job({ width: 400, height: 400 })],
    }),
  );
  assert.equal(audit.mode, 'multi-pass');
  assert.equal(audit.fallback, null);
  assert.equal(audit.passes, 3);
  assert.deepEqual(
    audit.jobs.map((j) => j.pass),
    [0, 1, 2],
  );
  assert.deepEqual(audit.buffer, {
    width: 512,
    height: 512,
    grew: false,
    growthAttempted: false,
    growthRefused: true,
  });
});

test('boundary: a growth exactly at the recorded refusal area is declined, a smaller one still proceeds', () => {
  // Same batch, but the recorded refusal is exactly the 512×1280 = 655360 the
  // full packing would ask for: that growth is declined (the refusal is
  // inclusive), while the smaller 512×1024 the shrink-and-retry pass finds is
  // still attempted and granted — two shelves per pass, two passes.
  const audit = auditMeshBlitBatch(
    input({
      buffer: {
        width: 512,
        height: 512,
        grantedWidth: 512,
        grantedHeight: 512,
        maxSize: 4096,
        refusedArea: 655360,
        testLimits: { area: null, width: null, height: null, tiling: true },
      },
      jobs: [job({ width: 400, height: 400 }), job({ width: 400, height: 400 }), job({ width: 400, height: 400 })],
    }),
  );
  assert.equal(audit.mode, 'multi-pass');
  assert.equal(audit.passes, 2);
  assert.deepEqual(
    audit.jobs.map((j) => j.pass),
    [0, 0, 1],
  );
  assert.equal(audit.buffer.growthRefused, true);
  assert.equal(audit.buffer.growthAttempted, true);
  assert.equal(audit.buffer.grew, true);
  assert.deepEqual([audit.buffer.width, audit.buffer.height], [512, 1024]);
});

test('boundary: with tiling disabled a job past the buffer is unaccommodated, not a fallback', () => {
  const audit = auditMeshBlitBatch(
    input({
      buffer: {
        width: 512,
        height: 512,
        grantedWidth: 512,
        grantedHeight: 512,
        maxSize: 4096,
        refusedArea: null,
        testLimits: { area: null, width: 512, height: 512, tiling: false },
      },
      jobs: [job({ width: 600, height: 600 }), job({ width: 100, height: 100 })],
    }),
  );
  assert.equal(audit.mode, 'unaccommodated');
  assert.equal(audit.fallback, null);
  assert.equal(audit.fallbackReason, null);
  const [big, small] = audit.jobs;
  assert.equal(big.placed, false);
  assert.equal(big.pass, -1);
  assert.equal(big.tiled, false);
  assert.match(big.reason ?? '', /tiling is disabled/);
  // The job that fits is still placed, in pass 0.
  assert.equal(small.placed, true);
  assert.equal(small.pass, 0);
});

test('texture uploads: a page shared under one pma uploads once; a pma disagreement re-uploads', () => {
  const audit = auditMeshBlitBatch(
    input({
      residentTextures: [{ page: 'page-b', pma: false }],
      jobs: [
        job({ page: 'page-a', pma: true, width: 50, height: 50 }),
        job({ page: 'page-a', pma: false, width: 50, height: 50 }),
        job({ page: 'page-b', pma: false, width: 50, height: 50 }),
        job({ page: 'page-b', pma: true, width: 50, height: 50 }),
      ],
    }),
  );
  assert.equal(audit.mode, 'single-pass');
  // page-a: first job uploads it (pma true), the second disagrees and forces
  // a re-upload. page-b: resident under pma false, so the third job is free
  // and the fourth re-uploads under pma true.
  assert.deepEqual(audit.pages, [
    { page: 'page-a', users: 2, uploads: 2, reuploads: 1, pmaConflict: true },
    { page: 'page-b', users: 2, uploads: 1, reuploads: 1, pmaConflict: true },
  ]);
});

test('the audit is JSON-serializable: stringify/parse round-trips and carries no functions', () => {
  const audit = auditMeshBlitBatch(
    input({
      buffer: {
        width: 512,
        height: 512,
        grantedWidth: 512,
        grantedHeight: 512,
        maxSize: 4096,
        refusedArea: null,
        testLimits: { area: null, width: null, height: null, tiling: true },
      },
      jobs: [job({ width: 5000, height: 100 }), job({ width: 400, height: 400 })],
    }),
  );
  const text = JSON.stringify(audit);
  assert.equal(typeof text, 'string');
  assert(!text.includes('undefined'));
  assert(!text.includes('function'));
  const roundTripped: unknown = JSON.parse(text);
  assert.deepEqual(roundTripped, audit);
  // The same holds for the fallback path, where every job carries a reason.
  const fallback = auditMeshBlitBatch(input({ context: { available: true, lost: true }, jobs: [job()] }));
  assert.deepEqual(JSON.parse(JSON.stringify(fallback)), fallback);
});
