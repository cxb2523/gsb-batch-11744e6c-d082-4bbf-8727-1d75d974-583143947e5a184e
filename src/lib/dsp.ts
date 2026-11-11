import type { DataPoint } from './parser';

export type WindowFunctionType = 'hann' | 'hamming' | 'rectangular';
export type PeakInterpolationMethod = 'lagrange_linear' | 'gaussian_log';

export interface FrequencyBin {
  bin: number;
  frequency: number;
  frequencyLabel: string;
  magnitude: number;
  decibels: number;
}

export interface SineFitResult {
  amplitude: number;
  offset: number;
  phaseDeg: number;
  rmse: number;
}

export interface SignalMetrics {
  count: number;
  min: number;
  max: number;
  mean: number;
  rms: number;
  vpp: number;
  stdDev: number;
  sampleRateHz: number;
  nyquistHz: number;
  freqResolutionHz: number;
  dominantFreqHz: number;
  dominantMagnitude: number;
  fftSize: number;
  jitterMs: number;
  jitterPercent: number;
  isJitterHigh: boolean;
  hasHardwareTiming?: boolean;
  // v2.3 Deep Spectral & Distortion Metrology
  snrDb?: number;
  thdDb?: number;
  thdPercent?: number;
  sinadDb?: number;
  enob?: number;
  sineFit?: SineFitResult;
}

/**
 * Computes the next power of two <= n (or >= n when padToNext is true), clamped to [minPow2, maxPow2].
 */
export function resolveFftSize(n: number, maxPow2 = 256): number {
  if (n < 8) return 8;
  const pow2 = Math.pow(2, Math.ceil(Math.log2(n)));
  return Math.min(Math.max(pow2, 16), maxPow2);
}

/**
 * Generates window coefficients w[n] and returns coherent amplitude gain G_coh = (1/N) * sum(w[n]).
 * - Hann:        w[n] = 0.5 * (1 - cos(2*pi*n / (N - 1)))       (Sidelobe: -31.5 dB)
 * - Hamming:     w[n] = 0.54 - 0.46 * cos(2*pi*n / (N - 1))     (Sidelobe: -42.7 dB)
 * - Rectangular: w[n] = 1.0                                      (Dirichlet kernel, -13.3 dB)
 */
export function computeWindow(
  length: number,
  type: WindowFunctionType = 'hann'
): { weights: Float64Array; coherentGain: number } {
  const weights = new Float64Array(length);
  if (length <= 1 || type === 'rectangular') {
    weights.fill(1.0);
    return { weights, coherentGain: 1.0 };
  }

  let sum = 0;
  const denom = length - 1;
  for (let n = 0; n < length; n++) {
    const phase = (2 * Math.PI * n) / denom;
    const w =
      type === 'hann'
        ? 0.5 * (1 - Math.cos(phase))
        : 0.54 - 0.46 * Math.cos(phase);
    weights[n] = w;
    sum += w;
  }

  return {
    weights,
    coherentGain: sum / length,
  };
}

/**
 * In-place Radix-2 Cooley-Tukey Fast Fourier Transform (FFT).
 * Complexity: O(N log2 N) complex butterfly operations vs O(N^2) direct DFT.
 *
 * Factorization:
 *   X[k]       = E[k] + W_N^k * O[k]
 *   X[k + N/2] = E[k] - W_N^k * O[k]
 * where W_N^k = exp(-j * 2 * pi * k / N) = cos(2*pi*k/N) - j*sin(2*pi*k/N).
 *
 * @param real Real part array of length N (must be a power of 2), mutated in-place.
 * @param imag Imaginary part array of length N (must be a power of 2), mutated in-place.
 */
export function radix2FFT(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`radix2FFT requires power-of-two length, received N=${n}`);
  }

  // 1. Bit-Reversal Permutation in-place
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      const tmpR = real[i];
      real[i] = real[j];
      real[j] = tmpR;

      const tmpI = imag[i];
      imag[i] = imag[j];
      imag[j] = tmpI;
    }
    let bit = n >> 1;
    while (bit >= 1 && j >= bit) {
      j -= bit;
      bit >>= 1;
    }
    j += bit;
  }

  // 2. Iterative Cooley-Tukey Butterfly Stages (stage size len = 2, 4, 8, ..., N)
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angleStep);
    const wStepI = Math.sin(angleStep);

    for (let i = 0; i < n; i += len) {
      let wR = 1.0;
      let wI = 0.0;

      for (let k = 0; k < halfLen; k++) {
        const evenIdx = i + k;
        const oddIdx = i + k + halfLen;

        // Complex multiplication: t = W_len^k * X_odd
        const tR = wR * real[oddIdx] - wI * imag[oddIdx];
        const tI = wR * imag[oddIdx] + wI * real[oddIdx];

        const uR = real[evenIdx];
        const uI = imag[evenIdx];

        // Butterfly combination
        real[evenIdx] = uR + tR;
        imag[evenIdx] = uI + tI;
        real[oddIdx] = uR - tR;
        imag[oddIdx] = uI - tI;

        // Advance twiddle factor W_len^(k+1) = W_len^k * W_len^1
        const nextWR = wR * wStepR - wI * wStepI;
        wI = wR * wStepI + wI * wStepR;
        wR = nextWR;
      }
    }
  }
}

/**
 * Direct O(N^2) Discrete Fourier Transform reference implementation (used for numerical verification).
 */
export function naiveDFT(
  inputReal: ArrayLike<number>
): { real: Float64Array; imag: Float64Array } {
  const n = inputReal.length;
  const real = new Float64Array(n);
  const imag = new Float64Array(n);

  for (let k = 0; k < n; k++) {
    let sumR = 0;
    let sumI = 0;
    for (let t = 0; t < n; t++) {
      const angle = (-2 * Math.PI * k * t) / n;
      const x = inputReal[t];
      sumR += x * Math.cos(angle);
      sumI += x * Math.sin(angle);
    }
    real[k] = sumR;
    imag[k] = sumI;
  }

  return { real, imag };
}

export interface SamplingTimingEstimate {
  sampleRateHz: number;
  medianDtMs: number;
  meanDtMs: number;
  jitterMs: number;
  jitterPercent: number;
  isJitterHigh: boolean;
  hasHardwareTiming: boolean;
}

/**
 * Robustly estimates sampling rate and inter-sample timing jitter from timestamped history.
 * If hardware timestamps (hardwareTimestampUs) are provided, timing and jitter are computed
 * directly from the hardware timer, completely eliminating USB CDC bulk-transfer jitter.
 * A high jitter percentage (> 20%) warns that serial polling or USB latency is non-deterministic.
 */
export function estimateSamplingTiming(history: DataPoint[], fallbackHz = 20): SamplingTimingEstimate {
  if (history.length < 3) {
    return {
      sampleRateHz: fallbackHz,
      medianDtMs: 1000 / fallbackHz,
      meanDtMs: 1000 / fallbackHz,
      jitterMs: 0,
      jitterPercent: 0,
      isJitterHigh: false,
      hasHardwareTiming: false,
    };
  }

  // 1. Check for hardware timer microsecond deltas
  const hwDeltas: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const prevUs = history[i - 1].hardwareTimestampUs;
    const currUs = history[i].hardwareTimestampUs;
    if (prevUs !== undefined && currUs !== undefined) {
      let diffUs = currUs - prevUs;
      if (diffUs < 0) {
        // Handle 32-bit hardware timer wrap (2^32 us = ~4294.97 seconds)
        diffUs += 4294967296;
      }
      const dtMs = diffUs / 1000;
      if (dtMs > 0.001 && dtMs < 60000) {
        hwDeltas.push(dtMs);
      }
    }
  }

  const useHardwareTiming = hwDeltas.length >= 2;
  const deltas: number[] = useHardwareTiming ? hwDeltas : [];

  if (!useHardwareTiming) {
    for (let i = 1; i < history.length; i++) {
      const dt = history[i].timestamp - history[i - 1].timestamp;
      if (dt > 0.2 && dt < 10000) {
        deltas.push(dt);
      }
    }
  }

  if (deltas.length === 0) {
    const totalSpanMs = history[history.length - 1].timestamp - history[0].timestamp;
    const estHz =
      totalSpanMs > 0 ? Number((((history.length - 1) * 1000) / totalSpanMs).toFixed(2)) : fallbackHz;
    return {
      sampleRateHz: estHz,
      medianDtMs: 1000 / estHz,
      meanDtMs: 1000 / estHz,
      jitterMs: 0,
      jitterPercent: 0,
      isJitterHigh: false,
      hasHardwareTiming: false,
    };
  }

  const sorted = [...deltas].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianDtMs =
    sorted.length % 2 !== 0 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);

  const sumDt = deltas.reduce((acc, v) => acc + v, 0);
  const meanDtMs = sumDt / deltas.length;
  const effectiveDtMs = meanDtMs > 0 ? meanDtMs : medianDtMs;
  const sampleRateHz = effectiveDtMs > 0 ? Number((1000 / effectiveDtMs).toFixed(2)) : fallbackHz;

  let varianceSum = 0;
  for (const dt of deltas) {
    const diff = dt - meanDtMs;
    varianceSum += diff * diff;
  }
  const jitterMs = Number(Math.sqrt(varianceSum / deltas.length).toFixed(2));
  const jitterPercent = effectiveDtMs > 0 ? Number(((jitterMs / effectiveDtMs) * 100).toFixed(1)) : 0;
  const isJitterHigh = deltas.length >= 8 && jitterPercent > 20.0;

  return {
    sampleRateHz,
    medianDtMs: Number(medianDtMs.toFixed(2)),
    meanDtMs: Number(meanDtMs.toFixed(2)),
    jitterMs,
    jitterPercent,
    isJitterHigh,
    hasHardwareTiming: useHardwareTiming,
  };
}

/**
 * Estimates effective sampling rate f_s (Hz) from timestamped data points.
 * Uses median inter-sample interval to resist occasional serial burst outliers.
 */
export function estimateSampleRateHz(history: DataPoint[], fallbackHz = 20): number {
  return estimateSamplingTiming(history, fallbackHz).sampleRateHz;
}

/**
 * 3-Point Parabolic Interpolation around discrete FFT peak bin k*
 * to estimate sub-bin peak frequency and amplitude.
 *
 * Supports two numerical formulations:
 * 1. gaussian_log (default): Parabolic fit on ln|X(k)| (optimal for bell/Gaussian/Hann windows, zero leakage bias).
 *    delta_log = 0.5 * (ln(alpha) - ln(gamma)) / (ln(alpha) - 2*ln(beta) + ln(gamma))
 * 2. lagrange_linear: Classical Lagrange 3-point polynomial interpolation on linear amplitude |X(k)|.
 *    delta_lin = 0.5 * (alpha - gamma) / (alpha - 2*beta + gamma)
 */
export function interpolatePeakBin(
  magnitudes: Float64Array,
  peakIndex: number,
  sampleRateHz: number,
  fftSize: number,
  method: PeakInterpolationMethod = 'gaussian_log'
): { frequencyHz: number; magnitude: number } {
  const binFreqStep = sampleRateHz / fftSize;
  if (peakIndex <= 0 || peakIndex >= magnitudes.length - 1) {
    return {
      frequencyHz: Number((peakIndex * binFreqStep).toFixed(2)),
      magnitude: Number(magnitudes[peakIndex].toFixed(4)),
    };
  }

  const alpha = magnitudes[peakIndex - 1];
  const beta = magnitudes[peakIndex];
  const gamma = magnitudes[peakIndex + 1];

  let delta = 0;
  let interpolatedMag = beta;

  if (method === 'gaussian_log') {
    const logA = Math.log(Math.max(alpha, 1e-12));
    const logB = Math.log(Math.max(beta, 1e-12));
    const logG = Math.log(Math.max(gamma, 1e-12));
    const denom = logA - 2 * logB + logG;

    if (Math.abs(denom) > 1e-12) {
      delta = 0.5 * ((logA - logG) / denom);
      delta = Math.max(-0.5, Math.min(0.5, delta));
      const logPeak = logB - 0.25 * (logA - logG) * delta;
      interpolatedMag = Math.exp(logPeak);
    }
  } else {
    const denom = alpha - 2 * beta + gamma;
    if (Math.abs(denom) > 1e-12) {
      delta = 0.5 * ((alpha - gamma) / denom);
      delta = Math.max(-0.5, Math.min(0.5, delta));
      interpolatedMag = beta - 0.25 * (alpha - gamma) * delta;
    }
  }

  const interpolatedFreq = (peakIndex + delta) * binFreqStep;

  return {
    frequencyHz: Number(interpolatedFreq.toFixed(2)),
    magnitude: Number(Math.max(beta, interpolatedMag).toFixed(4)),
  };
}

export interface SpectralDistortionResult {
  snrDb: number;
  thdDb: number;
  thdPercent: number;
  sinadDb: number;
  enob: number;
  fundamentalPower: number;
  harmonicPower: number;
  noisePower: number;
}

/**
 * Computes Signal-to-Noise Ratio (SNR), Total Harmonic Distortion (THD),
 * Signal-to-Noise-and-Distortion (SINAD), and Effective Number of Bits (ENOB).
 *
 * Formulas:
 *   P_fund = 0.5 * A_fund^2
 *   P_harm = sum_{h=2..5} 0.5 * A_h^2
 *   P_noise = max(P_total_ac - P_fund - P_harm, 1e-10)
 *   SNR = 10 * log10(P_fund / P_noise)
 *   THD = 10 * log10(P_harm / P_fund)
 *   SINAD = 10 * log10((P_fund + P_harm + P_noise) / (P_harm + P_noise))
 *   ENOB = max(0, (SINAD - 1.76) / 6.02)
 */
export function computeSpectralDistortion(
  spectrum: FrequencyBin[],
  _totalAcPower: number,
  peakIndex: number
): SpectralDistortionResult {
  if (spectrum.length <= 2 || peakIndex <= 0 || peakIndex >= spectrum.length) {
    return {
      snrDb: 0,
      thdDb: 0,
      thdPercent: 0,
      sinadDb: 0,
      enob: 0,
      fundamentalPower: 0,
      harmonicPower: 0,
      noisePower: 0,
    };
  }

  // 1. Identify Fundamental Main Lobe Bins (peakIndex and +/- 1 adjacent bin for Hann leakage)
  const fundBins = new Set<number>();
  for (let d = -1; d <= 1; d++) {
    const b = peakIndex + d;
    if (b >= 1 && b < spectrum.length) fundBins.add(b);
  }

  // 2. Identify Harmonic Bins (h = 2, 3, 4, 5) and their skirts
  const harmBins = new Set<number>();
  for (let h = 2; h <= 5; h++) {
    const harmBin = Math.round(h * peakIndex);
    for (let d = -1; d <= 1; d++) {
      const b = harmBin + d;
      if (b >= 1 && b < spectrum.length && !fundBins.has(b)) {
        harmBins.add(b);
      }
    }
  }

  // 3. Compute Powers across Spectrum
  const fundMag = spectrum[peakIndex].magnitude;
  const pFund = Math.max(0.5 * fundMag * fundMag, 1e-12);

  let pHarm = 0;
  for (const b of harmBins) {
    const m = spectrum[b].magnitude;
    pHarm += 0.5 * m * m;
  }
  pHarm = Math.max(pHarm, 1e-12);

  let pNoise = 0;
  for (let k = 1; k < spectrum.length; k++) {
    if (!fundBins.has(k) && !harmBins.has(k)) {
      const m = spectrum[k].magnitude;
      pNoise += 0.5 * m * m;
    }
  }
  pNoise = Math.max(pNoise, 1e-10);

  // 4. Metrics
  const snrDb = Number((10 * Math.log10(pFund / pNoise)).toFixed(1));
  const thdRatio = Math.max(pHarm / pFund, 1e-12);
  const thdDb = Number((10 * Math.log10(thdRatio)).toFixed(1));
  const thdPercent = Number((Math.sqrt(thdRatio) * 100).toFixed(2));

  const pDistortionAndNoise = pHarm + pNoise;
  const sinadRatio = Math.max((pFund + pDistortionAndNoise) / pDistortionAndNoise, 1.0);
  const sinadDb = Number((10 * Math.log10(sinadRatio)).toFixed(1));

  const enobRaw = (sinadDb - 1.76) / 6.02;
  const enob = Number(Math.max(0, enobRaw).toFixed(1));

  return {
    snrDb,
    thdDb,
    thdPercent,
    sinadDb,
    enob,
    fundamentalPower: Number(pFund.toFixed(6)),
    harmonicPower: Number(pHarm.toFixed(6)),
    noisePower: Number(pNoise.toFixed(6)),
  };
}

/**
 * IEEE-1057 3-Parameter Sine Wave Fit via Linear Least Squares.
 * Solves y(t) = A * cos(w0 * t) + B * sin(w0 * t) + C
 * analytically via Cramer's rule on 3x3 normal equations matrix.
 */
export function fitSineIEEE1057(
  samples: ArrayLike<number>,
  sampleRateHz: number,
  freqHz: number
): SineFitResult | null {
  const n = samples.length;
  if (n < 4 || freqHz <= 0 || sampleRateHz <= 0) return null;

  const omega0 = (2 * Math.PI * freqHz) / sampleRateHz;

  let sC2 = 0;
  let sS2 = 0;
  let sCS = 0;
  let sC = 0;
  let sS = 0;
  let sYC = 0;
  let sYS = 0;
  let sY = 0;

  for (let t = 0; t < n; t++) {
    const angle = omega0 * t;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const y = samples[t];

    sC2 += c * c;
    sS2 += s * s;
    sCS += c * s;
    sC += c;
    sS += s;
    sYC += y * c;
    sYS += y * s;
    sY += y;
  }

  const det =
    sC2 * (sS2 * n - sS * sS) -
    sCS * (sCS * n - sS * sC) +
    sC * (sCS * sS - sS2 * sC);

  if (Math.abs(det) < 1e-12) return null;

  const detA =
    sYC * (sS2 * n - sS * sS) -
    sCS * (sYS * n - sS * sY) +
    sC * (sYS * sS - sS2 * sY);

  const detB =
    sC2 * (sYS * n - sS * sY) -
    sYC * (sCS * n - sS * sC) +
    sC * (sCS * sY - sYS * sC);

  const detC =
    sC2 * (sS2 * sY - sYS * sS) -
    sCS * (sCS * sY - sYS * sC) +
    sYC * (sCS * sS - sS2 * sC);

  const A = detA / det;
  const B = detB / det;
  const C = detC / det;

  const amplitude = Math.hypot(A, B);
  const phaseRad = Math.atan2(-B, A);
  const phaseDeg = (phaseRad * 180) / Math.PI;

  let residualSqSum = 0;
  for (let t = 0; t < n; t++) {
    const angle = omega0 * t;
    const yModel = A * Math.cos(angle) + B * Math.sin(angle) + C;
    const diff = samples[t] - yModel;
    residualSqSum += diff * diff;
  }
  const rmse = Math.sqrt(residualSqSum / n);

  return {
    amplitude: Number(amplitude.toFixed(4)),
    offset: Number(C.toFixed(4)),
    phaseDeg: Number(phaseDeg.toFixed(2)),
    rmse: Number(rmse.toFixed(4)),
  };
}

/**
 * Welch's Averaged, Modified Periodogram Method for Power Spectral Density (PSD).
 * Reduces spectral variance across continuous records via 50% overlapping Hann windows.
 */
export function computeWelchPSD(
  samples: ArrayLike<number>,
  segmentLength = 64,
  overlap = 32,
  sampleRateHz = 1000
): { frequencies: Float64Array; psd: Float64Array } {
  const n = samples.length;
  const segLen = resolveFftSize(Math.min(segmentLength, n), 256);
  const hop = Math.max(1, segLen - overlap);

  const { weights } = computeWindow(segLen, 'hann');
  let windowPowerSum = 0;
  for (let i = 0; i < segLen; i++) {
    windowPowerSum += weights[i] * weights[i];
  }
  const numBins = (segLen >> 1) + 1;
  const psdAccum = new Float64Array(numBins);
  let numSegments = 0;

  for (let start = 0; start + segLen <= n; start += hop) {
    const real = new Float64Array(segLen);
    const imag = new Float64Array(segLen);

    let segMean = 0;
    for (let i = 0; i < segLen; i++) {
      segMean += samples[start + i];
    }
    segMean /= segLen;

    for (let i = 0; i < segLen; i++) {
      real[i] = (samples[start + i] - segMean) * weights[i];
    }

    radix2FFT(real, imag);

    for (let k = 0; k < numBins; k++) {
      const magSq = real[k] * real[k] + imag[k] * imag[k];
      const factor = k === 0 || k === segLen >> 1 ? 1.0 : 2.0;
      psdAccum[k] += (factor * magSq) / (sampleRateHz * windowPowerSum);
    }
    numSegments++;
  }

  if (numSegments > 0) {
    for (let k = 0; k < numBins; k++) {
      psdAccum[k] /= numSegments;
    }
  }

  const frequencies = new Float64Array(numBins);
  for (let k = 0; k < numBins; k++) {
    frequencies[k] = (k * sampleRateHz) / segLen;
  }

  return { frequencies, psd: psdAccum };
}

/**
 * Computes both time-domain metrology and single-sided FFT amplitude spectrum
 * from a history buffer of real-valued sensor samples.
 */
export function analyzeSignalAndSpectrum(
  history: DataPoint[],
  windowType: WindowFunctionType = 'hann',
  overrideSampleRateHz?: number,
  interpolationMethod: PeakInterpolationMethod = 'gaussian_log'
): { metrics: SignalMetrics; spectrum: FrequencyBin[] } {
  const nSamples = history.length;
  if (nSamples === 0) {
    return {
      metrics: {
        count: 0,
        min: 0,
        max: 0,
        mean: 0,
        rms: 0,
        vpp: 0,
        stdDev: 0,
        sampleRateHz: 0,
        nyquistHz: 0,
        freqResolutionHz: 0,
        dominantFreqHz: 0,
        dominantMagnitude: 0,
        fftSize: 0,
        jitterMs: 0,
        jitterPercent: 0,
        isJitterHigh: false,
      },
      spectrum: [],
    };
  }

  // 1. Time-Domain Statistics (Min, Max, Mean/DC, RMS, Vpp, StdDev)
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < nSamples; i++) {
    const v = history[i].value;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
  }

  const mean = sum / nSamples;
  const rms = Math.sqrt(sumSq / nSamples);
  const vpp = max - min;

  let varianceSum = 0;
  for (let i = 0; i < nSamples; i++) {
    const diff = history[i].value - mean;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / nSamples);

  const timing = estimateSamplingTiming(history);
  const sampleRateHz = overrideSampleRateHz ?? timing.sampleRateHz;
  const nyquistHz = Number((sampleRateHz / 2).toFixed(2));

  if (nSamples < 8) {
    return {
      metrics: {
        count: nSamples,
        min: Number(min.toFixed(3)),
        max: Number(max.toFixed(3)),
        mean: Number(mean.toFixed(3)),
        rms: Number(rms.toFixed(3)),
        vpp: Number(vpp.toFixed(3)),
        stdDev: Number(stdDev.toFixed(3)),
        sampleRateHz,
        nyquistHz,
        freqResolutionHz: 0,
        dominantFreqHz: 0,
        dominantMagnitude: 0,
        fftSize: 0,
        jitterMs: timing.jitterMs,
        jitterPercent: timing.jitterPercent,
        isJitterHigh: timing.isJitterHigh,
        hasHardwareTiming: timing.hasHardwareTiming,
      },
      spectrum: [],
    };
  }

  // 2. Prepare Zero-Mean Windowed Frame for Radix-2 FFT
  const fftSize = resolveFftSize(nSamples, 256);
  const activeSamples = Math.min(nSamples, fftSize);
  const startOffset = nSamples - activeSamples;

  const { weights, coherentGain } = computeWindow(activeSamples, windowType);
  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);

  for (let i = 0; i < activeSamples; i++) {
    // Subtract DC offset (mean) and apply window function w[i]
    const zeroMeanSample = history[startOffset + i].value - mean;
    real[i] = zeroMeanSample * weights[i];
    imag[i] = 0.0;
  }

  // Zero-padding from activeSamples .. fftSize - 1 is implicit in Float64Array

  // 3. Execute in-place Cooley-Tukey Radix-2 FFT
  radix2FFT(real, imag);

  // 4. Construct Single-Sided Amplitude Spectrum (k = 0 .. N/2)
  const numBins = (fftSize >> 1) + 1;
  const rawMagnitudes = new Float64Array(numBins);
  const spectrum: FrequencyBin[] = [];
  const scaleFactor = 2.0 / (activeSamples * coherentGain);

  let peakBinIndex = 0;
  let maxMag = 0;

  for (let k = 0; k < numBins; k++) {
    const re = real[k];
    const im = imag[k];
    const complexModulus = Math.hypot(re, im);
    // DC (k=0) and Nyquist (k=N/2) are not doubled in single-sided spectrum
    const isEdgeBin = k === 0 || k === fftSize >> 1;
    const mag = isEdgeBin
      ? complexModulus / (activeSamples * coherentGain)
      : complexModulus * scaleFactor;

    rawMagnitudes[k] = mag;
    const freq = (k * sampleRateHz) / fftSize;
    const db = 20 * Math.log10(Math.max(mag, 1e-6));

    if (k >= 1 && k < numBins - 1 && mag > maxMag) {
      maxMag = mag;
      peakBinIndex = k;
    }

    spectrum.push({
      bin: k,
      frequency: Number(freq.toFixed(2)),
      frequencyLabel: `${freq.toFixed(1)} Hz`,
      magnitude: Number(mag.toFixed(4)),
      decibels: Number(db.toFixed(1)),
    });
  }

  // 5. Sub-bin parabolic interpolation around peak bin k*
  const dominant =
    peakBinIndex > 0
      ? interpolatePeakBin(rawMagnitudes, peakBinIndex, sampleRateHz, fftSize, interpolationMethod)
      : { frequencyHz: 0, magnitude: 0 };

  const freqResolutionHz = Number((sampleRateHz / fftSize).toFixed(3));

  // 6. Deep Spectral Metrology: SNR, THD, SINAD, ENOB
  const distortion = computeSpectralDistortion(spectrum, varianceSum / nSamples, peakBinIndex);

  // 7. IEEE-1057 3-Parameter Sine Fit on Active Frame
  let sineFit: SineFitResult | undefined;
  if (dominant.frequencyHz > 0) {
    const sampleSlice = history.slice(startOffset, startOffset + activeSamples).map((d) => d.value);
    const res = fitSineIEEE1057(sampleSlice, sampleRateHz, dominant.frequencyHz);
    if (res) sineFit = res;
  }

  return {
    metrics: {
      count: nSamples,
      min: Number(min.toFixed(3)),
      max: Number(max.toFixed(3)),
      mean: Number(mean.toFixed(3)),
      rms: Number(rms.toFixed(3)),
      vpp: Number(vpp.toFixed(3)),
      stdDev: Number(stdDev.toFixed(3)),
      sampleRateHz,
      nyquistHz,
      freqResolutionHz,
      dominantFreqHz: dominant.frequencyHz,
      dominantMagnitude: dominant.magnitude,
      fftSize,
      jitterMs: timing.jitterMs,
      jitterPercent: timing.jitterPercent,
      isJitterHigh: timing.isJitterHigh,
      hasHardwareTiming: timing.hasHardwareTiming,
      snrDb: distortion.snrDb,
      thdDb: distortion.thdDb,
      thdPercent: distortion.thdPercent,
      sinadDb: distortion.sinadDb,
      enob: distortion.enob,
      sineFit,
    },
    spectrum,
  };
}
