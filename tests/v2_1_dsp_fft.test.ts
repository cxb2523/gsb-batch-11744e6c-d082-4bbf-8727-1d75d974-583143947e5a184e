import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  radix2FFT,
  naiveDFT,
  computeWindow,
  analyzeSignalAndSpectrum,
} from '../src/lib/dsp.ts';
import type { DataPoint } from '../src/lib/parser.ts';

describe('OpenSerial Studio v2.1 — DSP & Numerical Methods (Radix-2 FFT & Spectral Metrology)', () => {
  it('matches analytical O(N^2) DFT within floating-point precision (< 1e-11) via Cooley-Tukey Radix-2 FFT', () => {
    const N = 64;
    const signal = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      signal[n] =
        1.5 * Math.cos((2 * Math.PI * 3 * n) / N) -
        0.75 * Math.sin((2 * Math.PI * 11 * n) / N) +
        0.2 * ((n % 7) - 3);
    }

    const dft = naiveDFT(signal);
    const fftReal = new Float64Array(signal);
    const fftImag = new Float64Array(N);
    radix2FFT(fftReal, fftImag);

    for (let k = 0; k < N; k++) {
      assert.ok(
        Math.abs(fftReal[k] - dft.real[k]) < 1e-11,
        `Real mismatch at bin ${k}: ${fftReal[k]} vs ${dft.real[k]}`
      );
      assert.ok(
        Math.abs(fftImag[k] - dft.imag[k]) < 1e-11,
        `Imag mismatch at bin ${k}: ${fftImag[k]} vs ${dft.imag[k]}`
      );
    }
  });

  it('computes Hann, Hamming, and Rectangular window weights and coherent amplitude gain', () => {
    const hann = computeWindow(128, 'hann');
    assert.equal(hann.weights[0], 0);
    assert.equal(hann.weights[127], 0);
    assert.ok(Math.abs(hann.coherentGain - 0.5) < 0.01);

    const hamming = computeWindow(128, 'hamming');
    assert.ok(Math.abs(hamming.weights[0] - 0.08) < 1e-6);
    assert.ok(Math.abs(hamming.coherentGain - 0.54) < 0.01);

    const rect = computeWindow(128, 'rectangular');
    assert.equal(rect.coherentGain, 1.0);
  });

  it('rejects DC bias and recovers dual-tone harmonic amplitudes and frequencies', () => {
    const N = 128;
    const fs = 64; // 64 Hz sampling rate -> delta_f = 0.5 Hz/bin
    const dtMs = 1000 / fs;
    const history: DataPoint[] = [];

    for (let n = 0; n < N; n++) {
      const t = n / fs;
      // x(t) = 5.0 (DC) + 3.0*sin(2*pi*8*t) + 1.2*sin(2*pi*20*t)
      const val =
        5.0 +
        3.0 * Math.sin(2 * Math.PI * 8.0 * t) +
        1.2 * Math.sin(2 * Math.PI * 20.0 * t);
      history.push({
        time: `${n}`,
        timestamp: 100000 + n * dtMs,
        value: val,
      });
    }

    const { metrics, spectrum } = analyzeSignalAndSpectrum(history, 'hann', fs);
    assert.equal(metrics.fftSize, 128);
    assert.equal(metrics.sampleRateHz, 64);
    assert.equal(metrics.nyquistHz, 32);
    assert.equal(metrics.freqResolutionHz, 0.5);

    // DC offset should be ~5.0
    assert.ok(Math.abs(metrics.mean - 5.0) < 0.05);
    // Dominant peak at 8.0 Hz with amplitude ~3.0
    assert.ok(Math.abs(metrics.dominantFreqHz - 8.0) < 0.05);
    assert.ok(Math.abs(metrics.dominantMagnitude - 3.0) < 0.1);

    // Check secondary tone at 20.0 Hz (bin k = 20 / 0.5 = 40)
    const bin40 = spectrum[40];
    assert.equal(bin40.frequency, 20.0);
    assert.ok(Math.abs(bin40.magnitude - 1.2) < 0.08);
  });

  it('estimates sub-bin peak frequency via 3-point Lagrange parabolic interpolation', () => {
    const N = 128;
    const fs = 64; // Bin spacing = 0.5 Hz (Bin 20 = 10.0 Hz, Bin 21 = 10.5 Hz)
    const targetFreq = 10.25; // Midpoint between Bin 20 and Bin 21
    const history: DataPoint[] = [];

    for (let n = 0; n < N; n++) {
      const t = n / fs;
      history.push({
        time: `${n}`,
        timestamp: 200000 + n * (1000 / fs),
        value: 2.0 * Math.sin(2 * Math.PI * targetFreq * t),
      });
    }

    const { metrics } = analyzeSignalAndSpectrum(history, 'hann', fs);
    // Without interpolation, bin 20 or 21 gives 10.00 Hz or 10.50 Hz (error = 0.25 Hz).
    // With parabolic interpolation, error is < 0.03 Hz!
    assert.ok(
      Math.abs(metrics.dominantFreqHz - targetFreq) <= 0.03,
      `Expected ~${targetFreq} Hz, got ${metrics.dominantFreqHz} Hz`
    );
  });
});
