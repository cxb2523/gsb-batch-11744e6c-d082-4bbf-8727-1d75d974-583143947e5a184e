import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateArduinoCode,
  generateArduinoPlotterCode,
  generateSTM32Code,
  generateMicroPythonCode,
  ARDUINO_PWM_PINS,
  ARDUINO_DIGITAL_PINS,
  ESP32_ADC1_PINS,
} from '../src/lib/codegen.ts';
import { appendDataLoggerRecord, DEFAULT_MAX_LOG_RECORDS } from '../src/hooks/useDataLogger.ts';
import { toHexString } from '../src/lib/parser.ts';
import {
  estimateSamplingTiming,
  estimateSampleRateHz,
  analyzeSignalAndSpectrum,
} from '../src/lib/dsp.ts';

describe('OpenSerial Studio v2.1.1 — Hardware Bugfixes & Timing Metrology', () => {
  describe('Fix 1 & Fix 5: Raw Byte HEX Stream and Binary Integrity', () => {
    it('converts raw binary Uint8Array bytes (including 0x80+ non-ASCII) without UTF-8 corruption', () => {
      const rawBinary = new Uint8Array([0x00, 0x55, 0x7f, 0x80, 0xaa, 0xfe, 0xff]);
      const hex = toHexString(rawBinary);

      // Verify exact byte-by-byte hex formatting
      assert.equal(hex, '00 55 7F 80 AA FE FF');
      // Verify no UTF-8 replacement character byte (EF BF BD)
      assert.doesNotMatch(hex, /EF BF BD/);
    });

    it('continues to support string conversion for ASCII command streams', () => {
      const hex = toHexString('OK\n');
      assert.equal(hex, '4F 4B 0A');
    });
  });

  describe('Fix 2: STM32 HAL Template Linker Flag, Half-Transfer DMA & Race Condition', () => {
    const controls = [
      { id: 'relay_cmd', type: 'button' as const },
      { id: 'throttle_pwm', type: 'slider' as const },
    ];
    const widgets = ['Pressure_bar', 'Temperature_C'];

    it('includes STM32 -u _printf_float linker directive guidance for %.2f formatting', () => {
      const code = generateSTM32Code(widgets, controls);
      assert.match(code, /-u _printf_float/);
      assert.match(code, /float support in snprintf is disabled by default/);
    });

    it('disables half-transfer DMA interrupt to prevent premature callbacks', () => {
      const code = generateSTM32Code(widgets, controls);
      assert.match(code, /__HAL_DMA_DISABLE_IT\(huart2\.hdmarx, DMA_IT_HT\)/);
    });

    it('protects rxCommandLine from ISR/Task race condition via atomic IRQ lock and volatile flag', () => {
      const code = generateSTM32Code(widgets, controls);
      assert.match(code, /static volatile char rxCommandLine/);
      assert.match(code, /static volatile uint8_t rxFrameReady/);
      assert.match(code, /__disable_irq\(\)/);
      assert.match(code, /__enable_irq\(\)/);
      assert.match(code, /memcpy\(localBuf, \(const void \*\)rxCommandLine/);
    });
  });

  describe('Fix 3: Uno/Nano Timer PWM Pin Assignment & ESP32 ADC1 Safe Pins', () => {
    it('maps Arduino sliders exclusively to valid hardware PWM timer pins (3, 5, 6, 9, 10, 11)', () => {
      assert.deepEqual(Array.from(ARDUINO_PWM_PINS), [3, 5, 6, 9, 10, 11]);
      const allSliders = [
        { id: 'motor_speed', type: 'slider' as const },
        { id: 'heater_pwm', type: 'slider' as const },
        { id: 'fan_pwm', type: 'slider' as const },
      ];
      const code = generateArduinoCode([], allSliders);

      // First slider must get D3 (valid PWM pin), NOT D2 (which lacks timer on Uno/Nano)
      assert.match(code, /const int motor_speed_PIN = 3;/);
      assert.match(code, /const int heater_pwm_PIN = 5;/);
      assert.match(code, /const int fan_pwm_PIN = 6;/);
      assert.doesNotMatch(code, /const int motor_speed_PIN = 2;/);
    });

    it('maps Arduino buttons to standard digital pins (2, 4, 7, 8, 12, 13)', () => {
      assert.deepEqual(Array.from(ARDUINO_DIGITAL_PINS), [2, 4, 7, 8, 12, 13]);
      const mixedControls = [
        { id: 'start_btn', type: 'button' as const },
        { id: 'throttle', type: 'slider' as const },
        { id: 'stop_btn', type: 'button' as const },
      ];
      const code = generateArduinoPlotterCode([], mixedControls);

      assert.match(code, /const int start_btn_PIN = 2;/);
      assert.match(code, /const int throttle_PIN = 3;/);
      assert.match(code, /const int stop_btn_PIN = 4;/);
    });

    it('maps MicroPython ADC to ESP32 ADC1 safe pins (GPIO 32..39) to prevent Wi-Fi crash', () => {
      assert.ok(ESP32_ADC1_PINS.includes(32));
      const widgets = ['battery_v', 'current_a', 'solar_v'];
      const code = generateMicroPythonCode(widgets, []);

      assert.match(code, /ESP32 ADC1/);
      assert.match(code, /battery_v_adc = machine\.ADC\(machine\.Pin\(32\)\)/);
      assert.match(code, /current_a_adc = machine\.ADC\(machine\.Pin\(33\)\)/);
      assert.match(code, /solar_v_adc = machine\.ADC\(machine\.Pin\(34\)\)/);
      // Ensure it does NOT use ADC2 pins (like GPIO 26 or 27 on ESP32)
      assert.doesNotMatch(code, /machine\.Pin\(26\)\) # ESP32/);
    });
  });

  describe('Fix 4: Data Logger Ring-Buffer Bound & Memory Eviction', () => {
    it('evicts oldest samples (FIFO) once buffer reaches maxRecords to prevent tab OOM crash', () => {
      const testBuffer: Array<Record<string, unknown>> = [];
      const testCap = 5;

      for (let i = 0; i < 10; i++) {
        appendDataLoggerRecord(testBuffer, { sampleIndex: i }, testCap, `2026-01-01T00:00:0${i}Z`);
      }

      assert.equal(testBuffer.length, testCap);
      // Oldest samples (0..4) must have been evicted, newest (5..9) preserved
      assert.equal(testBuffer[0].sampleIndex, 5);
      assert.equal(testBuffer[4].sampleIndex, 9);
    });

    it('defaults to 100,000 maximum records', () => {
      assert.equal(DEFAULT_MAX_LOG_RECORDS, 100_000);
    });
  });

  describe('Fix 6: Sampling Timebase Estimation and Jitter Warning in DSP', () => {
    it('computes low jitter (< 5%) on a steady periodic sample stream', () => {
      const steadyData = Array.from({ length: 40 }, (_, i) => ({
        timestamp: 1000 + i * 25, // Exactly 40 Hz (25ms step)
        value: Math.sin((2 * Math.PI * 4 * i * 25) / 1000),
      }));

      const timing = estimateSamplingTiming(steadyData);
      assert.equal(timing.sampleRateHz, 40);
      assert.equal(timing.jitterMs, 0);
      assert.equal(timing.jitterPercent, 0);
      assert.equal(timing.isJitterHigh, false);
      assert.equal(estimateSampleRateHz(steadyData), 40);
    });

    it('detects high jitter (> 20%) on irregular or bursty serial packet arrivals', () => {
      // Simulate erratic USB packet delivery (alternating 5ms and 45ms intervals)
      let t = 1000;
      const jitteryData = [{ timestamp: t, value: 1.0 }];
      for (let i = 1; i <= 20; i++) {
        t += i % 2 === 0 ? 5 : 45;
        jitteryData.push({ timestamp: t, value: Math.sin(i) });
      }

      const timing = estimateSamplingTiming(jitteryData);
      assert.equal(timing.isJitterHigh, true);
      assert.ok(timing.jitterPercent > 20.0);
      assert.ok(timing.jitterMs > 10.0);

      // Verify analyzeSignalAndSpectrum propagates jitter metrics
      const result = analyzeSignalAndSpectrum(jitteryData);
      assert.equal(result.metrics.isJitterHigh, true);
      assert.equal(result.metrics.jitterPercent, timing.jitterPercent);
    });
  });
});
