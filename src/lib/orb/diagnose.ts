/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

/**
 * Audio source and level calibration diagnostics.
 *
 * Given a plain-data snapshot of what an audio source heard — the source
 * type, a frame per moment with its dt and its raw per-band decibels (null
 * when a frame read nothing), plus the seed and loudness for a simulated
 * voice — diagnose() replays the exact calibration pipeline of
 * AnalyserLevels / SimulatedVoice (lib/orb/audio.ts) and reports, per frame:
 * the raw normalized band values, the calibrated floor/peak/span, the
 * followed envelope and the overall level, followed by an ordered list of
 * checks (each named, passed or not, with a readable reason when not).
 *
 * The constants and the math below mirror audio.ts line for line so a
 * diagnosis matches a live source frame for frame; the parity tests in
 * diagnose.test.ts drive the real classes and assert exactly that.
 *
 * Everything here is pure: no AudioContext, no microphone or tab capture,
 * no network. The report is plain JSON-serializable data — no AnalyserNode,
 * no Float32Array.
 */

import type { Bands, OrbLevels } from "./audio";

/* Mirrored from audio.ts; must stay identical (the parity tests enforce it). */
const DB_LOW = -95;
const DB_HIGH = -20;
const PEAK_FALL = 0.05;
const FLOOR_RISE = 0.15;
const MIN_SPAN = 0.14;

const ATTACK = 28;
const RELEASE = 8;

function follow(current: number, target: number, dt: number) {
  const rate = target > current ? ATTACK : RELEASE;
  return current + (target - current) * (1 - Math.exp(-dt * rate));
}

const levelOf = (b: Bands) => Math.min(1, b[0] * 0.32 + b[1] * 0.36 + b[2] * 0.22 + b[3] * 0.1);

export type SourceKind = "analyser" | "simulated";

export interface DiagnoseFrameInput {
  /** Seconds since the previous frame; 0 is read as 1/60, as read() does. */
  dt: number;
  /**
   * The frame's raw decibels per band (analyser sources), or null when the
   * frame read no data. A null or non-finite entry is read as DB_LOW.
   * Ignored by simulated sources.
   */
  bands?: readonly (number | null)[] | null;
}

export interface DiagnoseTwinRequest {
  /**
   * The twin starts from the state just after this frame index was processed
   * (like calling twin() on the live source at that moment). Out-of-range
   * values clamp to the nearest valid moment.
   */
  afterFrame: number;
  /** The dts the twin then reads, in order. */
  dts: number[];
}

export interface DiagnoseSnapshot {
  source: SourceKind;
  frames: DiagnoseFrameInput[];
  /** Simulated sources only; defaults match SimulatedVoice (seed 1, loudness 1). */
  seed?: number;
  loudness?: number;
  /** Simulated sources only: also report a twin reader forked mid-stream. */
  twin?: DiagnoseTwinRequest;
}

export interface DiagnosedFrame {
  dt: number;
  /** The step actually applied: dt, or 1/60 when dt is 0. */
  step: number;
  /** Normalized decibels before calibration (analyser sources only). */
  raw: Bands | null;
  /** The self-calibrated quiet floor and loud peak (analyser sources only). */
  floor: Bands | null;
  peak: Bands | null;
  /** peak - floor, never below MIN_SPAN (analyser sources only). */
  span: Bands | null;
  /** The follow target: the calibrated band value, or the simulated target. */
  value: Bands;
  /** The envelope after the attack/release follow — what read() returns. */
  env: Bands;
  level: number;
}

export interface CheckItem {
  name: string;
  passed: boolean;
  /** Why the check failed, in plain words. Absent when it passed. */
  reason?: string;
}

export interface DiagnoseReport {
  source: SourceKind;
  /** True when every check passed. */
  ok: boolean;
  frames: DiagnosedFrame[];
  /** The twin reader's envelopes and levels, when a twin was requested. */
  twin: { env: Bands; level: number }[] | null;
  checks: CheckItem[];
}

/* ---------- the replayed pipelines ---------- */

function runAnalyserFrames(inputs: readonly DiagnoseFrameInput[]): DiagnosedFrame[] {
  const env: Bands = [0, 0, 0, 0];
  const floor: Bands = [1, 1, 1, 1];
  const peak: Bands = [0, 0, 0, 0];
  return inputs.map((input) => {
    const step = input.dt || 1 / 60;
    // A frame with no data, or a band with null or non-finite decibels,
    // reads as DB_LOW — silence at the bottom of the window, never NaN.
    const raw = [0, 1, 2, 3].map((band) => {
      const db = input.bands?.[band];
      const safe = db == null || !Number.isFinite(db) ? DB_LOW : db;
      return Math.min(1, Math.max(0, (safe - DB_LOW) / (DB_HIGH - DB_LOW)));
    }) as Bands;
    const span = [0, 0, 0, 0] as Bands;
    const value = [0, 0, 0, 0] as Bands;
    for (let band = 0; band < 4; band++) {
      floor[band] = Math.min(raw[band], floor[band] + FLOOR_RISE * step);
      peak[band] = Math.max(raw[band], peak[band] - PEAK_FALL * step);
      span[band] = Math.max(peak[band] - floor[band], MIN_SPAN);
      value[band] = Math.pow(Math.min(1, Math.max(0, (raw[band] - floor[band]) / span[band])), 1.8);
      env[band] = follow(env[band], value[band], step);
    }
    return {
      dt: input.dt,
      step,
      raw,
      floor: [...floor] as Bands,
      peak: [...peak] as Bands,
      span,
      value,
      env: [...env] as Bands,
      level: levelOf(env),
    };
  });
}

/* The simulated voice, mirrored from audio.ts (hash, noise, smooth, read). */

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(t: number) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

function smooth(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface SimState {
  t: number;
  env: Bands;
}

/** One SimulatedVoice.read(dt), advancing the state and returning the target. */
function simStep(state: SimState, seed: number, loudness: number, dt: number): Bands {
  state.t += dt || 1 / 60;
  const t = state.t;
  const s = seed * 19.7;
  const cycle = 2.6 + noise(Math.floor(t / 2.6) + s) * 0.8;
  const phase = (t % cycle) / cycle;
  const gate = smooth(0.0, 0.06, phase) * (1 - smooth(0.68 + noise(t * 0.3 + s) * 0.18, 0.86, phase));
  const rate = 4.6 + noise(t * 0.5 + s) * 1.6;
  const syllable = Math.pow(Math.max(0, Math.sin(t * rate * Math.PI * 2 + noise(t + s) * 2)), 1.6);
  const stress = 0.65 + 0.35 * noise(t * 2.2 + s * 2) * (1.2 - phase);
  const envelope = Math.min(1, gate * syllable * stress * loudness * 2.0);
  const sibilant = noise(t * 6 + s * 3) > 0.62 ? 1 : 0.25;
  const target: Bands = [
    envelope * (0.75 + 0.25 * noise(t * 3 + s)),
    envelope * (0.8 + 0.2 * noise(t * 5 + s + 4)),
    envelope * (0.45 + 0.35 * noise(t * 7 + s + 9)),
    envelope * 0.9 * sibilant,
  ];
  for (let band = 0; band < 4; band++) state.env[band] = follow(state.env[band], target[band], dt || 1 / 60);
  return target;
}

function simFrame(dt: number, target: Bands, env: Bands): DiagnosedFrame {
  return {
    dt,
    step: dt || 1 / 60,
    raw: null,
    floor: null,
    peak: null,
    span: null,
    value: [...target] as Bands,
    env: [...env] as Bands,
    level: levelOf(env),
  };
}

function runSimulatedFrames(snapshot: DiagnoseSnapshot): {
  frames: DiagnosedFrame[];
  twin: { env: Bands; level: number }[] | null;
} {
  const seed = snapshot.seed ?? 1;
  const loudness = snapshot.loudness ?? 1;
  const state: SimState = { t: seed * 7.31, env: [0, 0, 0, 0] };
  const frames: DiagnosedFrame[] = [];
  let twinState: SimState | null = null;
  const wantTwin = snapshot.twin != null;
  const forkAfter = wantTwin
    ? Math.max(-1, Math.min(snapshot.frames.length - 1, Math.trunc(snapshot.twin!.afterFrame)))
    : -2;
  if (wantTwin && forkAfter < 0) twinState = { t: state.t, env: [...state.env] as Bands };
  snapshot.frames.forEach((frame, i) => {
    const target = simStep(state, seed, loudness, frame.dt);
    frames.push(simFrame(frame.dt, target, state.env));
    if (i === forkAfter) twinState = { t: state.t, env: [...state.env] as Bands };
  });
  let twin: { env: Bands; level: number }[] | null = null;
  if (twinState) {
    const ts: SimState = twinState;
    twin = snapshot.twin!.dts.map((dt) => {
      simStep(ts, seed, loudness, dt);
      return { env: [...ts.env] as Bands, level: levelOf(ts.env) };
    });
  }
  return { frames, twin };
}

/* ---------- the checks ---------- */

function checkDecibels(snapshot: DiagnoseSnapshot, frames: DiagnosedFrame[]): CheckItem {
  const name = "non-finite-decibels-become-db-low";
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    for (let band = 0; band < 4; band++) {
      const db = snapshot.frames[i].bands?.[band];
      if (snapshot.source === "analyser" && (db == null || !Number.isFinite(db))) {
        if (frame.raw![band] !== 0) {
          return {
            name,
            passed: false,
            reason: `frame ${i} band ${band}: ${db == null ? "missing" : "non-finite"} decibels should read as DB_LOW (raw 0) but gave raw ${frame.raw![band]}`,
          };
        }
      }
      if (!Number.isFinite(frame.env[band])) {
        return { name, passed: false, reason: `frame ${i} band ${band}: envelope is not finite` };
      }
    }
    if (!Number.isFinite(frame.level)) {
      return { name, passed: false, reason: `frame ${i}: level is not finite` };
    }
  }
  return { name, passed: true };
}

function checkSpan(frames: DiagnosedFrame[]): CheckItem {
  const name = "span-never-below-min-span";
  for (let i = 0; i < frames.length; i++) {
    const span = frames[i].span;
    if (!span) continue; // simulated voices don't calibrate
    for (let band = 0; band < 4; band++) {
      if (!(span[band] >= MIN_SPAN)) {
        return {
          name,
          passed: false,
          reason: `frame ${i} band ${band}: span ${span[band]} is below MIN_SPAN ${MIN_SPAN}`,
        };
      }
    }
  }
  return { name, passed: true };
}

function checkLevel(frames: DiagnosedFrame[], twin: { env: Bands; level: number }[] | null): CheckItem {
  const name = "level-within-0-1";
  for (let i = 0; i < frames.length; i++) {
    const level = frames[i].level;
    if (!(level >= 0 && level <= 1)) {
      return { name, passed: false, reason: `frame ${i}: level ${level} is outside [0, 1]` };
    }
  }
  if (twin) {
    for (let i = 0; i < twin.length; i++) {
      const level = twin[i].level;
      if (!(level >= 0 && level <= 1)) {
        return { name, passed: false, reason: `twin frame ${i}: level ${level} is outside [0, 1]` };
      }
    }
  }
  return { name, passed: true };
}

function checkZeroDt(frames: DiagnosedFrame[]): CheckItem {
  const name = "zero-dt-uses-default-step";
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (frame.dt !== 0) continue;
    if (frame.step !== 1 / 60) {
      return {
        name,
        passed: false,
        reason: `frame ${i}: dt 0 should step by 1/60 but stepped by ${frame.step}`,
      };
    }
    const prev = i > 0 ? frames[i - 1].env : ([0, 0, 0, 0] as Bands);
    for (let band = 0; band < 4; band++) {
      if (follow(prev[band], frame.value[band], 1 / 60) !== frame.env[band]) {
        return {
          name,
          passed: false,
          reason: `frame ${i} band ${band}: dt 0 did not follow toward the target with a 1/60 step`,
        };
      }
    }
  }
  return { name, passed: true };
}

/**
 * Replay a snapshot through the calibration pipeline and check what comes
 * out. Pure: same snapshot in, same report out, nothing touched outside.
 */
export function diagnose(snapshot: DiagnoseSnapshot): DiagnoseReport {
  const simulated = snapshot.source === "simulated";
  const frames = simulated ? runSimulatedFrames(snapshot) : null;
  const diagnosed = simulated ? frames!.frames : runAnalyserFrames(snapshot.frames);
  const twin = simulated ? frames!.twin : null;
  const checks = [
    checkDecibels(snapshot, diagnosed),
    checkSpan(diagnosed),
    checkLevel(diagnosed, twin),
    checkZeroDt(diagnosed),
  ];
  return {
    source: snapshot.source,
    ok: checks.every((check) => check.passed),
    frames: diagnosed,
    twin,
    checks,
  };
}

/* ---------- per-frame diagnosis, for a live orb ---------- */

export interface FrameDiagnosis {
  /** Which of the orb's sources was read this frame. */
  source: "voice" | "caller";
  dt: number;
  /** The step the source applied: dt, or 1/60 when dt is 0. */
  step: number;
  /** The levels the source returned this frame, before the orb's own follow. */
  bands: Bands;
  level: number;
  ok: boolean;
  checks: CheckItem[];
}

/**
 * A one-frame diagnosis of levels a live source just returned — what the
 * VoiceOrb reports through its onDiagnose prop. Pure data in, pure data out.
 */
export function diagnoseFrame(source: "voice" | "caller", dt: number, levels: OrbLevels): FrameDiagnosis {
  const step = dt || 1 / 60;
  const checks: CheckItem[] = [];
  const badBand = levels.bands.findIndex((v) => !Number.isFinite(v));
  checks.push(
    badBand >= 0
      ? { name: "levels-finite", passed: false, reason: `band ${badBand} is not finite` }
      : !Number.isFinite(levels.level)
        ? { name: "levels-finite", passed: false, reason: `level ${levels.level} is not finite` }
        : { name: "levels-finite", passed: true },
  );
  checks.push(
    levels.level >= 0 && levels.level <= 1
      ? { name: "level-within-0-1", passed: true }
      : { name: "level-within-0-1", passed: false, reason: `level ${levels.level} is outside [0, 1]` },
  );
  checks.push(
    dt !== 0 || step === 1 / 60
      ? { name: "zero-dt-uses-default-step", passed: true }
      : { name: "zero-dt-uses-default-step", passed: false, reason: `dt 0 should step by 1/60, not ${step}` },
  );
  return {
    source,
    dt,
    step,
    bands: [...levels.bands] as Bands,
    level: levels.level,
    ok: checks.every((check) => check.passed),
    checks,
  };
}
