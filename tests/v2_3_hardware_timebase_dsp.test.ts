import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSerialPayloadDetailed,
  extractWidgetsFromBatch,
  type DataPoint,
} from '../src/lib/parser.ts';
import {
  estimateSamplingTiming,
  interpolatePeakBin,
  fitSineIEEE1057,
  computeWelchPSD,
  analyzeSignalAndSpectrum,
} from '../src/lib/dsp.ts';

describe('OpenSerial Studio v2.3 — Hardware Timebase & USB CDC Jitter Elimination', () => {
  it('extracts microsecond and millisecond hardware timebase and suppresses bogus dashboard widgets', () => {
    // 1. JSON with t_us
    const jsonRaw = '{"t_us": 1250000, "Signal_V": 3.14, "Temp": 25.4}';
    const jsonFrame = parseSerialPayloadDetailed(jsonRaw, 1700000000000);
    assert.ok(jsonFrame);
    assert.equal(jsonFrame.hardwareTimestampUs, 1250000);
    assert.equal(jsonFrame.values['Signal_V'], 3.14);
    assert.equal(jsonFrame.values['Temp'], 25.4);
    // Crucial: t_us must be removed from values so it does not render a giant noisy T_US chart widget
    assert.equal(jsonFrame.values['t_us'], undefined);

    // 2. Arduino Serial Plotter with t_us
    const plotterRaw = 't_us:500000,Vbat:3.82V,Current:1.25A';
    const plotterFrame = parseSerialPayloadDetailed(plotterRaw, 1700000000000);
    assert.ok(plotterFrame);
    assert.equal(plotterFrame.hardwareTimestampUs, 500000);
    assert.equal(plotterFrame.values['Vbat'], 3.82);
    assert.equal(plotterFrame.values['t_us'], undefined);

    // 3. Millisecond timebase (time_ms)
    const msRaw = '{"time_ms": 12500, "Rpm": 1800}';
    const msFrame = parseSerialPayloadDetailed(msRaw, 1700000000000);
    assert.ok(msFrame);
    assert.equal(msFrame.hardwareTimestampUs, 12500000); // 12500 ms * 1000 = 12500000 us
    assert.equal(msFrame.values['time_ms'], undefined);

    // 4. Sample sequence counter (seq)
    const seqRaw = '{"seq": 1042, "Motor_V": 12.0}';
    const seqFrame = parseSerialPayloadDetailed(seqRaw, 1700000000000);
    assert.ok(seqFrame);
    assert.equal(seqFrame.sampleSeq, 1042);
    assert.equal(seqFrame.values['seq'], undefined);
  });

  it('preserves hardwareTimestampUs in extracted widget history', () => {
    const frames = [
      parseSerialPayloadDetailed('{"t_us": 100000, "ADC": 512}', 1000)!,
      parseSerialPayloadDetailed('{"t_us": 110000, "ADC": 520}', 1010)!,
    ];

    const widgets = extractWidgetsFromBatch(frames, new Map());
    const adcWidget = widgets.get('ADC');
    assert.ok(adcWidget);
    assert.equal(adcWidget.history.length, 2);
    assert.equal(adcWidget.history[0].hardwareTimestampUs, 100000);
    assert.equal(adcWidget.history[1].hardwareTimestampUs, 110000);
  });

  it('eliminates USB CDC burst jitter when hardware microsecond timestamps are present', () => {
    // Simulate USB CDC burst delay: packets arrive in pairs at 0ms, 0ms, 20ms, 20ms, 40ms, 40ms...
    // Arrival jitter would be high (> 50%).
    // But MCU timer sampled steadily at exactly 10,000 us (10ms = 100 Hz).
    const history: DataPoint[] = [];
    const burstArrivals = [0, 1, 20, 21, 40, 41, 60, 61, 80, 81];

    for (let i = 0; i < 10; i++) {
      history.push({
        time: `00:0${i}`,
        timestamp: 1000 + burstArrivals[i],
        value: 1.0,
        hardwareTimestampUs: 1000000 + i * 10000, // exact 10ms = 10,000 us
      });
    }

    const timing = estimateSamplingTiming(history);
    assert.equal(timing.hasHardwareTiming, true);
    assert.equal(timing.sampleRateHz, 100); // 1000ms / 10ms = 100 Hz
    assert.equal(timing.jitterPercent, 0); // Zero jitter from MCU timer!
    assert.equal(timing.isJitterHigh, false);
  });

  it('correctly handles 32-bit hardware microsecond timer overflow wrap-around', () => {
    // 32-bit micros() wraps at 2^32 = 4,294,967,296 us
    const history: DataPoint[] = [
      { time: '1', timestamp: 1000, value: 1.0, hardwareTimestampUs: 4294960000 },
      { time: '2', timestamp: 1010, value: 1.0, hardwareTimestampUs: 4294965000 }, // +5000 us
      { time: '3', timestamp: 1020, value: 1.0, hardwareTimestampUs: 2704 },       // wrapped around: (2704 + 2^32) - 4294965000 = 5000 us
      { time: '4', timestamp: 1030, value: 1.0, hardwareTimestampUs: 7704 },       // +5000 us
    ];

    const timing = estimateSamplingTiming(history);
    assert.equal(timing.hasHardwareTiming, true);
    assert.equal(timing.medianDtMs, 5.0); // 5000 us = 5 ms
    assert.equal(timing.sampleRateHz, 200); // 1000 / 5 = 200 Hz
    assert.equal(timing.isJitterHigh, false);
  });
});

describe('OpenSerial Studio v2.3 — Deep DSP & Numerical Methods', () => {
  it('compares Lagrange linear and Gaussian log parabolic peak interpolation on fractional-bin sinusoid', () => {
    // Simulate discrete magnitudes of a peak around bin k=10 with true fractional bin k_true = 10.35
    // Magnitudes from Hann-windowed Dirichlet kernel
    const kPeak = 10;
    const magnitudes = new Float64Array(32);
    magnitudes[9] = 1.25;
    magnitudes[10] = 3.80;
    magnitudes[11] = 2.45;

    const sampleRateHz = 1000;
    const fftSize = 64; // delta_f = 1000 / 64 = 15.625 Hz

    const lagrange = interpolatePeakBin(magnitudes, kPeak, sampleRateHz, fftSize, 'lagrange_linear');
    const gaussLog = interpolatePeakBin(magnitudes, kPeak, sampleRateHz, fftSize, 'gaussian_log');

    assert.ok(lagrange.frequencyHz > 10 * 15.625);
    assert.ok(lagrange.frequencyHz < 11 * 15.625);
    assert.ok(gaussLog.frequencyHz > 10 * 15.625);
    assert.ok(gaussLog.frequencyHz < 11 * 15.625);
    assert.ok(gaussLog.magnitude >= magnitudes[kPeak]);
  });

  it('accurately fits a pure sinusoidal signal using IEEE-1057 3-Parameter Sine Fit', () => {
    const fs = 1000; // 1 kHz sampling rate
    const f0 = 50;   // 50 Hz test sinusoid
    const A_true = 2.5;
    const offset_true = 1.65;
    const phaseDeg_true = 30.0;
    const phaseRad = (phaseDeg_true * Math.PI) / 180;

    const n = 128;
    const samples = new Float64Array(n);
    for (let t = 0; t < n; t++) {
      const angle = (2 * Math.PI * f0 * t) / fs;
      // y(t) = A * cos(w*t + phi) + C
      //      = A*cos(phi)*cos(w*t) - A*sin(phi)*sin(w*t) + C
      samples[t] = A_true * Math.cos(angle + phaseRad) + offset_true;
    }

    const fit = fitSineIEEE1057(samples, fs, f0);
    assert.ok(fit);
    assert.ok(Math.abs(fit.amplitude - A_true) < 0.01, `Expected amplitude ~${A_true}, got ${fit.amplitude}`);
    assert.ok(Math.abs(fit.offset - offset_true) < 0.01, `Expected offset ~${offset_true}, got ${fit.offset}`);
    assert.ok(Math.abs(fit.phaseDeg - phaseDeg_true) < 0.5, `Expected phase ~${phaseDeg_true} deg, got ${fit.phaseDeg}`);
    assert.ok(fit.rmse < 0.001, `Expected near-zero RMSE, got ${fit.rmse}`);
  });

  it('computes spectral distortion metrics: SNR, THD, SINAD, and ENOB', () => {
    // Generate a 128-point single-frequency pure sine with 10% 2nd harmonic
    const fs = 1000;
    const f0 = 50;
    const n = 128;
    const history: DataPoint[] = [];

    for (let t = 0; t < n; t++) {
      const tSec = t / fs;
      // Fundamental: 2.0V @ 50 Hz, 2nd Harmonic: 0.2V (10%) @ 100 Hz
      const val = 2.0 * Math.sin(2 * Math.PI * f0 * tSec) + 0.2 * Math.sin(2 * Math.PI * 2 * f0 * tSec);
      history.push({
        time: `${t}`,
        timestamp: t * 1,
        value: val,
        hardwareTimestampUs: t * 1000,
      });
    }

    const { metrics, spectrum } = analyzeSignalAndSpectrum(history, 'hann');
    assert.ok(spectrum.length > 0);
    assert.ok(metrics.dominantFreqHz >= 48 && metrics.dominantFreqHz <= 52);

    // THD should reflect the 10% (-20 dB) harmonic
    assert.ok(metrics.thdPercent !== undefined && metrics.thdPercent > 5 && metrics.thdPercent < 20);
    assert.ok(metrics.thdDb !== undefined && metrics.thdDb < -15);

    // SINAD and ENOB should be finite and positive
    assert.ok(metrics.sinadDb !== undefined && metrics.sinadDb > 10);
    assert.ok(metrics.enob !== undefined && metrics.enob > 1.0);
    assert.equal(metrics.hasHardwareTiming, true);
  });

  it('computes Welch PSD (Power Spectral Density) with 50% overlapping Hann segments', () => {
    const fs = 1000;
    const n = 256;
    const samples = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      samples[i] = Math.sin(2 * Math.PI * 125 * (i / fs));
    }

    const { frequencies, psd } = computeWelchPSD(samples, 64, 32, fs);
    assert.ok(frequencies.length > 0);
    assert.ok(psd.length > 0);

    // Find peak in Welch PSD
    let maxIdx = 0;
    let maxPsd = -1;
    for (let k = 1; k < psd.length; k++) {
      if (psd[k] > maxPsd) {
        maxPsd = psd[k];
        maxIdx = k;
      }
    }
    const peakFreq = frequencies[maxIdx];
    assert.ok(Math.abs(peakFreq - 125) <= (fs / 64), `Expected Welch peak near 125 Hz, got ${peakFreq} Hz`);
  });
});
