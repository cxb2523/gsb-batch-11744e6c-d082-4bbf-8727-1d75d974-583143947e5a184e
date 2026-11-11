/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

/**
 * Tests for the audio calibration diagnostics (diagnose.ts), run with the
 * repo's `pnpm test` (Node's built-in runner — no network, no audio device,
 * no credentials). The analyser-side tests drive the real AnalyserLevels
 * with a fake AnalyserNode and assert the diagnosis matches it frame for
 * frame, value for value.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { AnalyserLevels, SimulatedVoice } from "./audio.ts";
import { diagnose, diagnoseFrame } from "./diagnose.ts";

/* ---------- a fake AnalyserNode with exact band alignment ---------- */

// 50 Hz per bin puts every EDGES boundary on a whole bin, so each band owns
// its bins exactly: [1,7) [7,22) [22,56) [56,140).
const SAMPLE_RATE = 51200;
const FFT_SIZE = 1024;
const BIN_COUNT = FFT_SIZE / 2;
const HZ_PER_BIN = SAMPLE_RATE / FFT_SIZE;
const EDGES = [90, 350, 1100, 2800, 7000];
const DB_LOW = -95;
const MIN_SPAN = 0.14;

function bandRange(band: number) {
  return {
    from: Math.max(1, Math.floor(EDGES[band] / HZ_PER_BIN)),
    to: Math.min(BIN_COUNT, Math.ceil(EDGES[band + 1] / HZ_PER_BIN)),
  };
}

/** A spectrum whose bands hold the given decibels; elsewhere -Infinity. */
function spectrumFor(bands: readonly (number | null)[] | null): Float32Array {
  const data = new Float32Array(BIN_COUNT).fill(-Infinity);
  if (bands) {
    for (let band = 0; band < 4; band++) {
      const db = bands[band];
      if (db == null) continue;
      const { from, to } = bandRange(band);
      data.fill(db, from, to);
    }
  }
  return data;
}

/** The band decibels AnalyserLevels.read will compute for this spectrum. */
function bandDb(data: Float32Array, band: number): number {
  const { from, to } = bandRange(band);
  let power = 0;
  for (let i = from; i < to; i++) {
    const db = data[i];
    if (Number.isFinite(db)) power += Math.pow(10, db / 10);
  }
  return to > from && power > 0 ? 10 * Math.log10(power / (to - from)) : DB_LOW;
}

function fakeAnalyser(spectra: Float32Array[]): AnalyserNode {
  let frame = 0;
  return {
    frequencyBinCount: BIN_COUNT,
    fftSize: FFT_SIZE,
    context: { sampleRate: SAMPLE_RATE },
    getFloatFrequencyData(out: Float32Array) {
      out.set(spectra[Math.min(frame++, spectra.length - 1)]);
    },
  } as unknown as AnalyserNode;
}

/** Deterministic pseudo-random in [0, 1), so the samples are stable. */
function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function assertFrameEqual(
  got: { env: number[]; level: number },
  actual: { bands: number[]; level: number },
  label: string,
) {
  assert.deepStrictEqual([...got.env], [...actual.bands], `${label}: bands`);
  assert.strictEqual(got.level, actual.level, `${label}: level`);
}

/* ---------- normal path: parity with the real AnalyserLevels ---------- */

test("analyser: diagnosis matches AnalyserLevels frame for frame", () => {
  const rand = prng(42);
  const dts = [1 / 60, 0.016, 0.033, 0, 0.1, 1 / 60, 0.25];
  const frames = Array.from({ length: 40 }, (_, i) => {
    const talking = i % 7 < 4;
    return {
      dt: dts[i % dts.length],
      bands: [0, 1, 2, 3].map(() => (talking ? -70 + rand() * 45 : DB_LOW + rand() * 3)),
    };
  });
  const spectra = frames.map((f) => spectrumFor(f.bands));
  const source = new AnalyserLevels(fakeAnalyser(spectra));
  const report = diagnose({
    source: "analyser",
    frames: frames.map((f, i) => ({
      dt: f.dt,
      bands: [0, 1, 2, 3].map((band) => bandDb(spectra[i], band)),
    })),
  });

  assert.strictEqual(report.frames.length, frames.length);
  frames.forEach((frame, i) => {
    assertFrameEqual(report.frames[i], source.read(frame.dt), `frame ${i}`);
  });
  assert.ok(report.ok, JSON.stringify(report.checks));
  assert.ok(report.checks.every((check) => check.passed));
  // The report is plain JSON: no AnalyserNode, no Float32Array, no NaN.
  assert.deepStrictEqual(JSON.parse(JSON.stringify(report)), report);
});

/* ---------- negative path: null and non-finite decibels ---------- */

test("analyser: null and NaN decibels read as DB_LOW, never NaN", () => {
  const frames: { dt: number; bands: (number | null)[] | null }[] = [
    { dt: 1 / 60, bands: [-60, -55, -50, -65] },
    { dt: 1 / 60, bands: null }, // the frame read nothing
    { dt: 1 / 60, bands: [-60, NaN, -50, -65] }, // one band is NaN
    { dt: 1 / 60, bands: [NaN, NaN, NaN, NaN] },
    { dt: 1 / 60, bands: [-Infinity, -55, Infinity, -65] },
    { dt: 1 / 60, bands: [-60, null, -50, -65] }, // one band missing
    { dt: 1 / 60, bands: null },
  ];
  const spectra = frames.map((f) => spectrumFor(f.bands));
  const source = new AnalyserLevels(fakeAnalyser(spectra));
  const report = diagnose({
    source: "analyser",
    // The snapshot carries the bad values as-is; the real class meets them
    // as bins and lands on the same DB_LOW.
    frames: frames.map((f, i) => ({
      dt: f.dt,
      bands: f.bands ? f.bands.map((db, band) => (db != null && !Number.isFinite(db) ? db : bandDb(spectra[i], band))) : null,
    })),
  });

  frames.forEach((frame, i) => {
    assertFrameEqual(report.frames[i], source.read(frame.dt), `frame ${i}`);
  });
  // Nothing NaN anywhere in the report.
  const text = JSON.stringify(report);
  assert.ok(!text.includes("NaN") && !text.includes("Infinity"), text);
  for (const [i, frame] of report.frames.entries()) {
    const input = frames[i].bands;
    for (let band = 0; band < 4; band++) {
      const db = input?.[band];
      if (db == null || !Number.isFinite(db)) {
        assert.strictEqual(frame.raw![band], 0, `frame ${i} band ${band}: raw should be 0 (DB_LOW)`);
      }
      assert.ok(Number.isFinite(frame.env[band]));
    }
    assert.ok(Number.isFinite(frame.level));
  }
  assert.ok(report.ok, JSON.stringify(report.checks));
  const decibelsCheck = report.checks.find((c) => c.name === "non-finite-decibels-become-db-low")!;
  assert.ok(decibelsCheck.passed, decibelsCheck.reason);
});

/* ---------- boundary path: dt 0 and continuous silence ---------- */

test("analyser: dt 0 steps by 1/60 and silence keeps span at MIN_SPAN with level 0", () => {
  // Continuous silence, including dt-0 frames.
  const frames = Array.from({ length: 120 }, (_, i) => ({
    dt: i % 3 === 0 ? 0 : 1 / 60,
    bands: null as null,
  }));
  const spectra = frames.map(() => spectrumFor(null));
  const source = new AnalyserLevels(fakeAnalyser(spectra));
  const report = diagnose({ source: "analyser", frames });

  frames.forEach((frame, i) => {
    assertFrameEqual(report.frames[i], source.read(frame.dt), `frame ${i}`);
  });
  for (const [i, frame] of report.frames.entries()) {
    for (let band = 0; band < 4; band++) {
      assert.ok(frame.span![band] >= MIN_SPAN, `frame ${i} band ${band}: span ${frame.span![band]}`);
    }
    assert.strictEqual(frame.level, 0, `frame ${i}: silence should hold level 0`);
    if (frame.dt === 0) assert.strictEqual(frame.step, 1 / 60);
  }
  assert.ok(report.ok, JSON.stringify(report.checks));
  const zeroDt = report.checks.find((c) => c.name === "zero-dt-uses-default-step")!;
  assert.ok(zeroDt.passed, zeroDt.reason);
  const span = report.checks.find((c) => c.name === "span-never-below-min-span")!;
  assert.ok(span.passed, span.reason);
});

/* ---------- simulated source: determinism and twin sync ---------- */

test("simulated: same seed reproduces SimulatedVoice and twin stays in sync", () => {
  const seed = 7;
  const loudness = 0.9;
  const dts = Array.from({ length: 50 }, (_, i) => [1 / 60, 0.02, 0, 0.05][i % 4]);
  const split = 20;

  const report = diagnose({
    source: "simulated",
    seed,
    loudness,
    frames: dts.map((dt) => ({ dt })),
    twin: { afterFrame: split - 1, dts: dts.slice(split) },
  });

  // Frame-for-frame parity with the real voice.
  const voice = new SimulatedVoice(seed, loudness);
  dts.forEach((dt, i) => {
    assertFrameEqual(report.frames[i], voice.read(dt), `frame ${i}`);
  });

  // A twin forked after `split` frames reads in step with its origin.
  const origin = new SimulatedVoice(seed, loudness);
  for (let i = 0; i < split; i++) origin.read(dts[i]);
  const twin = origin.twin()!;
  assert.ok(report.twin);
  assert.strictEqual(report.twin.length, dts.length - split);
  dts.slice(split).forEach((dt, j) => {
    const a = origin.read(dt);
    const b = twin.read(dt);
    assert.deepStrictEqual([...b.bands], [...a.bands], `twin frame ${j}: out of sync`);
    assert.strictEqual(b.level, a.level);
    assertFrameEqual(report.twin![j], b, `twin frame ${j}`);
  });

  // Same seed, same dts: identical report. Different seed: different envelopes.
  const again = diagnose({
    source: "simulated",
    seed,
    loudness,
    frames: dts.map((dt) => ({ dt })),
    twin: { afterFrame: split - 1, dts: dts.slice(split) },
  });
  assert.deepStrictEqual(again, report);
  const other = diagnose({ source: "simulated", seed: seed + 1, loudness, frames: dts.map((dt) => ({ dt })) });
  assert.notDeepStrictEqual(
    other.frames.map((f) => f.env),
    report.frames.map((f) => f.env),
  );
  assert.ok(report.ok, JSON.stringify(report.checks));
});

/* ---------- the per-frame diagnosis the orb reports ---------- */

test("diagnoseFrame: flags non-finite levels and defaults dt 0 to 1/60", () => {
  const good = diagnoseFrame("voice", 0, { bands: [0.5, 0.4, 0.3, 0.2], level: 0.4 });
  assert.ok(good.ok);
  assert.strictEqual(good.step, 1 / 60);
  assert.strictEqual(good.source, "voice");

  const bad = diagnoseFrame("caller", 1 / 60, { bands: [0.5, NaN, 0.3, 0.2], level: 1.5 });
  assert.ok(!bad.ok);
  assert.ok(!bad.checks.find((c) => c.name === "levels-finite")!.passed);
  assert.ok(!bad.checks.find((c) => c.name === "level-within-0-1")!.passed);
  assert.ok(bad.checks.find((c) => c.name === "zero-dt-uses-default-step")!.passed);
  // Still plain JSON (JSON itself has no NaN; it becomes null on the wire).
  assert.ok(JSON.stringify(bad).includes("levels-finite"));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(good)), good);
});
