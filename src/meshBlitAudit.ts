/**
 * Mesh rasterization audit — a pure, synchronous rehearsal of the batching
 * decisions `MeshGlBlitter.flush()` makes for one batch of mesh jobs.
 *
 * The blitter itself is a module-level singleton wrapped around a live WebGL
 * context, so "what would this batch do?" is otherwise unanswerable without a
 * GPU, a document and the shared context's whole history. This module takes a
 * plain-data snapshot of that state — context liveness, the held buffer and
 * what the browser granted of it, `maxSize`, the recorded refusal area, the
 * test limits, and the batch's jobs — and returns the plan `flush()` would
 * arrive at: one pass or several, which jobs are tiled, which cannot be
 * accommodated and why, the page-texture uploads to expect, and whether the
 * caller ends up on its canvas2d fallback.
 *
 * The decision semantics mirror the source:
 *
 * - A batch the buffer holds whole — every job within `maxSize` and the
 *   shelf-packing within the granted buffer — is one pass; every job draws in
 *   pass 0.
 * - A batch the granted buffer cannot hold, or one past `maxSize`, goes
 *   through `acquire` (grow toward the request as far as the grant model
 *   allows, a quantum at a time, never below the buffer already held) and is
 *   then planned as passes through that buffer, with an oversized job cut
 *   into tiles that never cross a `maxSize` window.
 * - A recorded refusal area is sticky: a growth whose area is not smaller
 *   than it is never attempted (smaller growths still are).
 * - Only a lost context or unavailable WebGL sends the caller to canvas2d.
 *   Size never does: a job too large for the buffer is tiled, and when it
 *   cannot be tiled (tiling disabled, or no tile quantum) the audit marks
 *   that job unaccommodated — where the real `flush()` would return false for
 *   the whole batch, the audit reports per-job placement instead, so a
 *   caller can see exactly which jobs fit and which do not.
 * - Page textures are keyed by the page image: jobs naming the same page with
 *   the same `pma` share one upload; a `pma` that disagrees with the live
 *   upload (a resident one, or one earlier in the batch) forces a re-upload.
 *
 * The grant model stands in for the browser: the snapshot's granted size
 * vouches for the buffer as held, and a growth is granted in full exactly
 * when its area stays under the test-area cap — the same stand-in
 * `limitForTesting({ area })` plants in the blitter. Nothing else about a
 * browser is knowable from a snapshot.
 *
 * Purity is the contract: this module creates no WebGL context, touches no
 * `window`/`document`, reads no image or typed array, and mutates nothing
 * outside its own frame. Input and output are JSON-serializable plain data —
 * no functions, no WebGL objects, no canvas references, no `Infinity`/`NaN`
 * in the output (a snapshot with no recorded refusal or test cap uses null).
 */

// The blitter's packing constants, duplicated rather than imported: importing
// MeshGlBlitter.ts would evaluate its module scope, and this module exists to
// answer the blitter's questions without a live context. Keep these in step
// with GUTTER / GROW_STEP / ALIGN there.
const GUTTER = 1;
const GROW_STEP = 256;
const ALIGN = 32;
const MIN_BUFFER_WIDTH = 512;

/** Context liveness, as `getMeshGlBlitter()` would see it. */
export interface MeshBlitAuditContextSnapshot {
  /** WebGL itself is usable (the singleton could be created at all). */
  available: boolean;
  /** The shared context has been lost (`lost` on the blitter). */
  lost: boolean;
}

/** The blitter's test-only caps; null lifts a cap, as `limitForTesting(null)` does. */
export interface MeshBlitAuditTestLimits {
  /** Area cap standing for a browser that grants less than asked. */
  area: number | null;
  /** Side caps below `maxSize`. */
  width: number | null;
  height: number | null;
  /** False declines a job larger than the buffer instead of tiling it. */
  tiling: boolean;
}

/** The offscreen drawing buffer's state. */
export interface MeshBlitAuditBufferSnapshot {
  /** The buffer's current size (the canvas's width/height). */
  width: number;
  height: number;
  /** What the browser granted of it (the drawing-buffer size). */
  grantedWidth: number;
  grantedHeight: number;
  /** The blitter's `maxSize`: the largest viewport window, ALIGN-quantized. */
  maxSize: number;
  /**
   * The smallest growth area the browser has refused in full; a growth to
   * this area or more is not attempted. Null when none has been recorded
   * (the blitter's `Number.POSITIVE_INFINITY`, which JSON cannot carry).
   */
  refusedArea: number | null;
  testLimits: MeshBlitAuditTestLimits;
}

/** One mesh job, as plain data — the fields of `MeshBlitJob` that decide a flush. */
export interface MeshBlitAuditJob {
  /** Destination per-part canvas backing size. */
  canvasWidth: number;
  canvasHeight: number;
  /** Identity of the atlas page image (the texture cache key), as a string. */
  page: string;
  /** `page.pma` — whether the page's texels are already premultiplied. */
  pma: boolean;
  /** Vertex count of the mesh (bbox-relative pairs). */
  vertexCount: number;
  /** Triangle count (`triangles.length / 3`). */
  triangleCount: number;
  /** Backing-store pixels per CSS px. */
  ratio: number;
  /** Rasterized region in device px — what gets packed, tiled and blitted. */
  width: number;
  height: number;
}

export interface MeshBlitAuditInput {
  context: MeshBlitAuditContextSnapshot;
  buffer: MeshBlitAuditBufferSnapshot;
  /**
   * Pages already uploaded before this batch, with the `pma` they were
   * uploaded under — the texture cache as it stands. Omit for an empty cache.
   */
  residentTextures?: Array<{ page: string; pma: boolean }>;
  jobs: MeshBlitAuditJob[];
}

/** What the batch as a whole would do. */
export type MeshBlitAuditMode =
  /** Every job whole in one pass through the buffer. */
  | 'single-pass'
  /** No tiling, but the packing needs more than one pass through the buffer. */
  | 'multi-pass'
  /** At least one job was cut into tiles (with one or more passes). */
  | 'tiled'
  /** At least one job could not be placed at all (its reason says why). */
  | 'unaccommodated'
  /** The caller draws this batch on its canvas2d path. */
  | 'fallback';

export interface MeshBlitJobAudit {
  /** Index into the input's `jobs`. */
  index: number;
  page: string;
  pma: boolean;
  /** The job drew at least one piece. */
  placed: boolean;
  /** The pass the job's first piece draws in; -1 when unplaced. */
  pass: number;
  /** The job was cut into tiles (it did not fit the buffer whole). */
  tiled: boolean;
  /** Pieces cut for this job — 1 for a whole job, more for a tiled one. */
  tiles: number;
  /** Why the job could not be placed; null when it was. */
  reason: string | null;
}

export interface MeshBlitPageAudit {
  page: string;
  /** Jobs in this batch drawing the page — its texture's user count here. */
  users: number;
  /** GL uploads this batch would perform for the page (0 on the fallback). */
  uploads: number;
  /** Uploads forced by a `pma` disagreeing with the live upload. */
  reuploads: number;
  /**
   * The page's `pma` is not consistent: jobs in this batch carry both values,
   * or the batch's value disagrees with the resident upload.
   */
  pmaConflict: boolean;
}

export interface MeshBlitAudit {
  mode: MeshBlitAuditMode;
  /** `'canvas2d'` when the caller falls back; null when the GL path draws. */
  fallback: 'canvas2d' | null;
  /** Why the fallback triggers; null otherwise. Never triggered by size. */
  fallbackReason: string | null;
  /** Passes the batch would draw through the buffer. */
  passes: number;
  /** Pieces (whole jobs plus tiles) placed across those passes. */
  pieces: number;
  /** Jobs cut into tiles. */
  tiledJobs: number;
  /** Interleaved vertex floats the batch would upload (`triangles * 4`). */
  vertexFloats: number;
  buffer: {
    /** The buffer size the flush would end on (after any growth). */
    width: number;
    height: number;
    /** The buffer grew to make room for this batch. */
    grew: boolean;
    /** A growth was tried against the grant model at all. */
    growthAttempted: boolean;
    /** A growth was declined because its area met a recorded refusal. */
    growthRefused: boolean;
  };
  jobs: MeshBlitJobAudit[];
  pages: MeshBlitPageAudit[];
}

/** One rect of the buffer in one pass — a whole job, or one tile of it. */
interface AuditPiece {
  job: number;
  tx: number;
  ty: number;
  tw: number;
  th: number;
  bx: number;
  by: number;
  pass: number;
}

/** The smallest position at or after `v` on the piece phase (GUTTER modulo ALIGN). */
function onPhase(v: number): number {
  return v + ((((GUTTER - v) % ALIGN) + ALIGN) % ALIGN);
}

/**
 * The blitter's shelf-packing, verbatim: pieces tallest first into a
 * `bufW`-wide buffer, a new pass when a piece would cross `bufH`. Sets each
 * piece's position and pass; returns the height the packing needs.
 */
function shelfPack(pieces: AuditPiece[], bufW: number, bufH: number): number {
  const order = pieces.slice().sort((a, b) => b.th - a.th);
  let pass = 0;
  let shelfX = GUTTER;
  let shelfY = GUTTER;
  let shelfH = 0;
  let height = GUTTER;
  for (const piece of order) {
    if (shelfX + piece.tw + GUTTER > bufW) {
      shelfY = onPhase(shelfY + shelfH + GUTTER);
      shelfX = GUTTER;
      shelfH = 0;
    }
    if (shelfY + piece.th + GUTTER > bufH) {
      pass++;
      shelfX = GUTTER;
      shelfY = GUTTER;
      shelfH = 0;
      height = GUTTER;
    }
    piece.bx = shelfX;
    piece.by = shelfY;
    piece.pass = pass;
    shelfX = onPhase(shelfX + piece.tw + GUTTER);
    if (piece.th > shelfH) shelfH = piece.th;
    if (shelfY + piece.th + GUTTER > height) height = shelfY + piece.th + GUTTER;
  }
  return height;
}

/**
 * Rehearses one `flush()` of `input.jobs` against the snapshot and returns
 * the plan as plain data. See the module header for the decision semantics.
 */
export function auditMeshBlitBatch(input: MeshBlitAuditInput): MeshBlitAudit {
  const { context, buffer, jobs } = input;
  const limits = buffer.testLimits;
  const resident = input.residentTextures ?? [];

  const pageOrder: string[] = [];
  const users = new Map<string, number>();
  for (const job of jobs) {
    if (!users.has(job.page)) pageOrder.push(job.page);
    users.set(job.page, (users.get(job.page) ?? 0) + 1);
  }
  const vertexFloats = jobs.reduce((sum, job) => sum + job.triangleCount * 3 * 4, 0);
  const jobAudits: MeshBlitJobAudit[] = jobs.map((job, index) => ({
    index,
    page: job.page,
    pma: job.pma,
    placed: false,
    pass: -1,
    tiled: false,
    tiles: 0,
    reason: null,
  }));

  const pageAudits = (uploads: Map<string, number>, reuploads: Map<string, number>): MeshBlitPageAudit[] =>
    pageOrder.map((page) => {
      const pmas = new Set(jobs.filter((job) => job.page === page).map((job) => job.pma));
      const held = resident.find((entry) => entry.page === page);
      return {
        page,
        users: users.get(page) ?? 0,
        uploads: uploads.get(page) ?? 0,
        reuploads: reuploads.get(page) ?? 0,
        pmaConflict: pmas.size > 1 || (held !== undefined && !pmas.has(held.pma)),
      };
    });

  // Only context loss or unavailable WebGL sends the caller to canvas2d —
  // never a size, however large (flush() documents the same).
  if (!context.available || context.lost) {
    const reason = !context.available
      ? 'WebGL is unavailable: getMeshGlBlitter() returns null and the caller stays on its canvas2d path'
      : 'the shared WebGL context is lost: flush() returns false and the caller draws the batch on its canvas2d path';
    for (const audit of jobAudits) audit.reason = reason;
    return {
      mode: 'fallback',
      fallback: 'canvas2d',
      fallbackReason: reason,
      passes: 0,
      pieces: 0,
      tiledJobs: 0,
      vertexFloats,
      buffer: {
        width: buffer.width,
        height: buffer.height,
        grew: false,
        growthAttempted: false,
        growthRefused: false,
      },
      jobs: jobAudits,
      pages: pageAudits(new Map(), new Map()),
    };
  }

  const limitW = Math.floor(Math.min(buffer.maxSize, limits.width ?? Number.POSITIVE_INFINITY) / ALIGN) * ALIGN;
  const limitH = Math.floor(Math.min(buffer.maxSize, limits.height ?? Number.POSITIVE_INFINITY) / ALIGN) * ALIGN;
  const testArea = limits.area ?? Number.POSITIVE_INFINITY;
  let refused = buffer.refusedArea ?? Number.POSITIVE_INFINITY;
  let curW = buffer.width;
  let curH = buffer.height;
  let grew = false;
  let growthAttempted = false;
  let growthRefused = false;

  // The grant model: the snapshot's granted size vouches for the buffer as
  // held; a growth is granted in full exactly when its area stays under the
  // test-area cap, the stand-in `limitForTesting({ area })` plants for a
  // browser that grants less.
  const grantHolds = (w: number, h: number): boolean =>
    w === buffer.width && h === buffer.height
      ? buffer.grantedWidth === w && buffer.grantedHeight === h
      : w * h <= testArea;

  // reserve(), verbatim in spirit: grow-only and quantized, a growth at or
  // past the recorded refusal is not attempted, a grant short of the request
  // is undone and its area remembered.
  const reserve = (width: number, height: number): boolean => {
    if (width > limitW || height > limitH) return false;
    if (width > curW || height > curH) {
      const w = Math.min(limitW, Math.ceil(Math.max(width, curW) / GROW_STEP) * GROW_STEP);
      const h = Math.min(limitH, Math.ceil(Math.max(height, curH) / GROW_STEP) * GROW_STEP);
      if (w * h >= refused) {
        growthRefused = true;
        return false;
      }
      growthAttempted = true;
      if (!grantHolds(w, h)) {
        refused = Math.min(refused, w * h);
        return false;
      }
      curW = w;
      curH = h;
      grew = true;
    }
    return grantHolds(curW, curH);
  };

  // acquire(), verbatim: shrink the request a quantum at a time, larger side
  // first, never below the buffer already held, past every refused area.
  const acquire = (width: number, height: number): boolean => {
    let w = Math.max(curW, Math.min(limitW, Math.ceil(width / GROW_STEP) * GROW_STEP));
    let h = Math.max(curH, Math.min(limitH, Math.ceil(height / GROW_STEP) * GROW_STEP));
    for (;;) {
      const held = w <= curW && h <= curH;
      if (held || w * h < refused) {
        if (reserve(w, h)) return true;
        if (held) return false;
      }
      if (w >= h && w - GROW_STEP >= curW) w -= GROW_STEP;
      else if (h - GROW_STEP >= curH) h -= GROW_STEP;
      else if (w - GROW_STEP >= curW) w -= GROW_STEP;
      else {
        w = curW;
        h = curH;
      }
    }
  };

  // plan(), with one deliberate difference: where the blitter's plan returns
  // null (a job needs tiling and tiling is off, or the buffer has no tile
  // quantum) and flush() returns false for the whole batch, the audit places
  // the jobs it can and marks the rest unaccommodated with the reason.
  const plan = (bufW: number, bufH: number): AuditPiece[] => {
    const tileW = Math.floor((bufW - GUTTER * 2) / ALIGN) * ALIGN;
    const tileH = Math.floor((bufH - GUTTER * 2) / ALIGN) * ALIGN;
    const max = buffer.maxSize;
    const pieces: AuditPiece[] = [];
    for (let i = 0; i < jobs.length; i++) {
      const { width, height } = jobs[i];
      if (width + GUTTER * 2 <= bufW && height + GUTTER * 2 <= bufH && width <= max && height <= max) {
        pieces.push({ job: i, tx: 0, ty: 0, tw: width, th: height, bx: 0, by: 0, pass: 0 });
        continue;
      }
      const audit = jobAudits[i];
      if (!limits.tiling) {
        audit.reason = `job ${width}×${height} does not fit the ${bufW}×${bufH} buffer within maxSize ${max} and tiling is disabled`;
        continue;
      }
      if (tileW <= 0 || tileH <= 0) {
        audit.reason = `the ${bufW}×${bufH} buffer leaves no tile quantum for job ${width}×${height}`;
        continue;
      }
      audit.tiled = true;
      for (let wy = 0; wy < height; wy += max) {
        const wh = Math.min(max, height - wy);
        for (let wx = 0; wx < width; wx += max) {
          const ww = Math.min(max, width - wx);
          for (let ty = wy; ty < wy + wh; ty += tileH) {
            for (let tx = wx; tx < wx + ww; tx += tileW) {
              pieces.push({ job: i, tx, ty, tw: Math.min(tileW, wx + ww - tx), th: Math.min(tileH, wy + wh - ty), bx: 0, by: 0, pass: 0 });
            }
          }
        }
      }
    }
    shelfPack(pieces, bufW, bufH);
    // Stable: a pass keeps the packing's tallest-first order.
    return pieces.sort((a, b) => a.pass - b.pass);
  };

  // One pass if the buffer holds the whole batch: every job whole, shelf-packed.
  let width = Math.max(MIN_BUFFER_WIDTH, curW);
  for (const job of jobs) width = Math.max(width, job.width + GUTTER * 2);
  let pieces: AuditPiece[] = jobs.map((job, i) => ({ job: i, tx: 0, ty: 0, tw: job.width, th: job.height, bx: 0, by: 0, pass: 0 }));
  const height = shelfPack(pieces, width, Number.POSITIVE_INFINITY);
  if (!reserve(width, height)) {
    if (!acquire(width, height)) {
      // Even the buffer already held is not granted in full: no piece can
      // draw. (A live blitter returns false here; the audit reports it as
      // unaccommodated rather than as a context loss, which it is not.)
      const reason = `the browser did not grant even the held ${curW}×${curH} buffer in full`;
      for (const audit of jobAudits) audit.reason = reason;
      pieces = [];
    } else {
      pieces = plan(curW, curH);
    }
  }

  let passes = 0;
  for (const piece of pieces) {
    const audit = jobAudits[piece.job];
    if (!audit.placed) {
      audit.placed = true;
      audit.pass = piece.pass;
    }
    audit.tiles++;
    if (piece.pass + 1 > passes) passes = piece.pass + 1;
  }

  // The texture uploads the batch would perform: one per page the cache does
  // not already hold, plus one each time a job's `pma` disagrees with the
  // live upload (textureFor deletes and re-uploads under the new flag).
  const live = new Map<string, boolean>();
  for (const entry of resident) live.set(entry.page, entry.pma);
  const uploads = new Map<string, number>();
  const reuploads = new Map<string, number>();
  for (const piece of pieces) {
    const job = jobs[piece.job];
    const held = live.get(job.page);
    if (held === undefined) {
      uploads.set(job.page, (uploads.get(job.page) ?? 0) + 1);
      live.set(job.page, job.pma);
    } else if (held !== job.pma) {
      uploads.set(job.page, (uploads.get(job.page) ?? 0) + 1);
      reuploads.set(job.page, (reuploads.get(job.page) ?? 0) + 1);
      live.set(job.page, job.pma);
    }
  }

  const tiledJobs = jobAudits.filter((audit) => audit.tiled).length;
  const unaccommodated = jobAudits.some((audit) => !audit.placed);
  const mode: MeshBlitAuditMode = unaccommodated
    ? 'unaccommodated'
    : tiledJobs > 0
      ? 'tiled'
      : passes > 1
        ? 'multi-pass'
        : 'single-pass';

  return {
    mode,
    fallback: null,
    fallbackReason: null,
    passes,
    pieces: pieces.length,
    tiledJobs,
    vertexFloats,
    buffer: { width: curW, height: curH, grew, growthAttempted, growthRefused },
    jobs: jobAudits,
    pages: pageAudits(uploads, reuploads),
  };
}
