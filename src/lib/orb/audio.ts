/*!
 * Voice orb by UV · https://github.com/imuvrays1/voice-orb
 * Copyright (c) 2026 UV · MIT License (see LICENSE). Keep this notice in copies.
 */

"use client";

/**
 * Where an orb hears a voice: four bands and an overall level, read once per
 * frame by the orb.
 *
 * Bands, by frequency: bass (90-350 Hz), low mid (350 Hz-1.1 kHz), high mid
 * (1.1-2.8 kHz) and treble (2.8-7 kHz). The edges sit where a call carries
 * speech: telephone audio has little below 300 Hz, so a classic 80-250 Hz bass
 * band would mostly measure line hum. Each follows the voice with a fast attack
 * and a slow release, so a syllable lands at once and its tail fades rather
 * than flickering.
 *
 * Levels calibrate themselves. A recording, a microphone and a live call all
 * arrive at different loudness, and a fixed scale either pins loud speech at
 * the top or leaves quiet speech at the bottom. So each band reads the
 * spectrum in decibels over a wide range (nothing clips), then scales between
 * its own recent quiet floor and loud peak: the floor drops at once to any
 * silence and creeps up slowly, the peak jumps to any loud moment and sinks
 * slowly. What reaches the orb is the voice's rise and fall at any level.
 *
 * Sources:
 *   AnalyserLevels   any Web Audio AnalyserNode: a playing <audio> element
 *                    (analyserForElement), the microphone (openMicrophone),
 *                    this tab's sound (openTabAudio), or a voice SDK's
 *                    analyser in a live call
 *   SimulatedVoice   a synthetic speech envelope, for orbs with nothing to
 *                    play and for the board's state cards
 */

export type Bands = [number, number, number, number];

export interface OrbLevels {
  bands: Bands;
  level: number;
}

export interface LevelSource {
  read(dt: number): OrbLevels;
  /**
   * A second reader of the same voice. A source keeps its own envelope and
   * clock, so two orbs reading one source would each advance it; give the
   * second orb a twin instead.
   */
  twin?(): LevelSource;
}

const EDGES = [90, 350, 1100, 2800, 7000];
/* The decibel window a band is read in before calibration: wide enough that
   speech never clips at the top. */
const DB_LOW = -95;
const DB_HIGH = -20;
/* How fast the calibration moves, per second: the peak sinks, the floor rises.
   The floor drops at once in every gap between syllables, so rising fairly
   quickly the rest of the time makes it track the background, not the voice. */
const PEAK_FALL = 0.05;
const FLOOR_RISE = 0.15;
/* The smallest span between floor and peak: below it, room tone would be
   stretched into a voice. */
const MIN_SPAN = 0.14;

const ATTACK = 28;
const RELEASE = 8;

function follow(current: number, target: number, dt: number) {
  const rate = target > current ? ATTACK : RELEASE;
  return current + (target - current) * (1 - Math.exp(-dt * rate));
}

const levelOf = (b: Bands) => Math.min(1, b[0] * 0.32 + b[1] * 0.36 + b[2] * 0.22 + b[3] * 0.1);

export class AnalyserLevels implements LevelSource {
  private data: Float32Array<ArrayBuffer> | null = null;
  private env: Bands = [0, 0, 0, 0];
  private floor: Bands = [1, 1, 1, 1];
  private peak: Bands = [0, 0, 0, 0];

  constructor(private analyser: AnalyserNode) {}

  twin(): LevelSource {
    return new AnalyserLevels(this.analyser);
  }

  read(dt: number): OrbLevels {
    const a = this.analyser;
    const step = dt || 1 / 60;
    if (!this.data || this.data.length !== a.frequencyBinCount) {
      this.data = new Float32Array(a.frequencyBinCount);
    }
    a.getFloatFrequencyData(this.data);
    const hzPerBin = a.context.sampleRate / a.fftSize;
    for (let band = 0; band < 4; band++) {
      const from = Math.max(1, Math.floor(EDGES[band] / hzPerBin));
      const to = Math.min(this.data.length, Math.ceil(EDGES[band + 1] / hzPerBin));
      // Average the band's power, not its decibels, then back to decibels.
      let power = 0;
      for (let i = from; i < to; i++) {
        const db = this.data[i];
        if (Number.isFinite(db)) power += Math.pow(10, db / 10);
      }
      const db = to > from && power > 0 ? 10 * Math.log10(power / (to - from)) : DB_LOW;
      const raw = Math.min(1, Math.max(0, (db - DB_LOW) / (DB_HIGH - DB_LOW)));

      this.floor[band] = Math.min(raw, this.floor[band] + FLOOR_RISE * step);
      this.peak[band] = Math.max(raw, this.peak[band] - PEAK_FALL * step);
      const span = Math.max(this.peak[band] - this.floor[band], MIN_SPAN);
      const value = Math.pow(Math.min(1, Math.max(0, (raw - this.floor[band]) / span)), 1.8);
      this.env[band] = follow(this.env[band], value, step);
    }
    return { bands: [...this.env] as Bands, level: levelOf(this.env) };
  }
}

/* ---------- Web Audio plumbing ---------- */

let context: AudioContext | null = null;

function audioContext(): AudioContext {
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

/* An element can be connected to Web Audio only once, so its analyser is kept. */
const elementAnalysers = new WeakMap<HTMLMediaElement, AnalyserNode>();

/**
 * An analyser on an <audio> element that still plays through the speakers.
 * Call from a user gesture (a Play press), as browsers require for audio.
 */
export function analyserForElement(element: HTMLMediaElement): AnalyserNode {
  const existing = elementAnalysers.get(element);
  if (existing) {
    audioContext();
    return existing;
  }
  const ctx = audioContext();
  const source = ctx.createMediaElementSource(element);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;
  source.connect(analyser);
  analyser.connect(ctx.destination);
  elementAnalysers.set(element, analyser);
  return analyser;
}

/** The microphone, analysed and not played back. `stop()` releases it. */
export async function openMicrophone(): Promise<{ analyser: AnalyserNode; stop: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = audioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;
  source.connect(analyser);
  return {
    analyser,
    stop: () => {
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}

/**
 * This tab's own sound, through the browser's share prompt (Chrome and Edge
 * on a computer). A page can't read another site's player, such as a YouTube
 * embed, but it may ask to hear its own tab, embeds included. The capture is
 * analysed and not played back (the tab is already playing it). `stop()`
 * ends the share; `onEnd` fires if the person stops it from the browser.
 * Call from a user gesture. Throws where the browser can't share tab audio
 * or the person declines.
 */
export async function openTabAudio(onEnd?: () => void): Promise<{ analyser: AnalyserNode; stop: () => void }> {
  const media = navigator.mediaDevices;
  if (!media?.getDisplayMedia) throw new Error("This browser can't share a tab's audio.");
  // Chrome needs video in the request; the options steer its prompt to this
  // tab with its audio on. Other browsers ignore what they don't know.
  const stream = await media.getDisplayMedia({
    video: true,
    audio: true,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    systemAudio: "exclude",
  } as DisplayMediaStreamOptions);
  const track = stream.getAudioTracks()[0];
  const stop = () => stream.getTracks().forEach((t) => t.stop());
  if (!track) {
    stop();
    throw new Error("The share had no audio.");
  }
  const ctx = audioContext();
  const source = ctx.createMediaStreamSource(new MediaStream([track]));
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.55;
  source.connect(analyser);
  track.addEventListener("ended", () => onEnd?.(), { once: true });
  return {
    analyser,
    stop: () => {
      source.disconnect();
      stop();
    },
  };
}

/* ---------- a synthetic voice ---------- */

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 1D noise, 0..1. */
function noise(t: number) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}

/**
 * Speech, roughly: syllables at four to six a second, grouped into phrases of
 * one and a half to three seconds with short pauses between, louder at the
 * start of a phrase. The bands take the envelope at different weights, with
 * treble only on some syllables (the sibilants). Deterministic per seed, so
 * the board's cards each speak their own way, the same way on every visit.
 */
export class SimulatedVoice implements LevelSource {
  private t: number;
  private env: Bands = [0, 0, 0, 0];

  constructor(private seed = 1, private loudness = 1) {
    this.t = seed * 7.31;
  }

  /** The same voice from the same moment, so the two stay in step. */
  twin(): LevelSource {
    const copy = new SimulatedVoice(this.seed, this.loudness);
    copy.t = this.t;
    copy.env = [...this.env] as Bands;
    return copy;
  }

  read(dt: number): OrbLevels {
    this.t += dt || 1 / 60;
    const t = this.t;
    const s = this.seed * 19.7;
    // Phrase gate: on for most of each ~2.6s cycle, with a varying pause.
    const cycle = 2.6 + noise(Math.floor(t / 2.6) + s) * 0.8;
    const phase = (t % cycle) / cycle;
    const gate = smooth(0.0, 0.06, phase) * (1 - smooth(0.68 + noise(t * 0.3 + s) * 0.18, 0.86, phase));
    // Syllables.
    const rate = 4.6 + noise(t * 0.5 + s) * 1.6;
    const syllable = Math.pow(Math.max(0, Math.sin(t * rate * Math.PI * 2 + noise(t + s) * 2)), 1.6);
    const stress = 0.65 + 0.35 * noise(t * 2.2 + s * 2) * (1.2 - phase);
    const envelope = Math.min(1, gate * syllable * stress * this.loudness * 2.0);
    const sibilant = noise(t * 6 + s * 3) > 0.62 ? 1 : 0.25;
    const target: Bands = [
      envelope * (0.75 + 0.25 * noise(t * 3 + s)),
      envelope * (0.8 + 0.2 * noise(t * 5 + s + 4)),
      envelope * (0.45 + 0.35 * noise(t * 7 + s + 9)),
      envelope * 0.9 * sibilant,
    ];
    for (let band = 0; band < 4; band++) this.env[band] = follow(this.env[band], target[band], dt || 1 / 60);
    return { bands: [...this.env] as Bands, level: levelOf(this.env) };
  }
}

function smooth(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
