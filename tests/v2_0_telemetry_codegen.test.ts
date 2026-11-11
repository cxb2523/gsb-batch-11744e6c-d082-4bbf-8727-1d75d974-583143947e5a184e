import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSerialPayloadDetailed,
  parseSerialPayload,
  extractWidgetsFromBatch,
  parseHexInput,
  toHexString,
  inferUnitFromKey,
  type WidgetConfig,
} from '../src/lib/parser.ts';
import {
  generateArduinoCode,
  generateArduinoPlotterCode,
  generateSTM32Code,
  generateMicroPythonCode,
} from '../src/lib/codegen.ts';

describe('OpenSerial Studio v2.0 — Multi-Protocol Telemetry Parser', () => {
  it('parses flat and nested JSON payloads with unit inference and {value, unit} unwrapping', () => {
    const raw = JSON.stringify({
      temp_c: 26.4,
      imu: { pitch: 1.25, roll: -3.5 },
      vbat: { value: 3.72, unit: 'V' },
      status: 'READY',
    });

    const frame = parseSerialPayloadDetailed(raw, 1700000000000);
    assert.ok(frame);
    assert.equal(frame.protocol, 'json');
    assert.equal(frame.values['temp_c'], 26.4);
    assert.equal(frame.units['temp_c'], '°C');
    assert.equal(frame.values['imu.pitch'], 1.25);
    assert.equal(frame.values['imu.roll'], -3.5);
    assert.equal(frame.values['vbat'], 3.72);
    assert.equal(frame.units['vbat'], 'V');
    assert.equal(frame.values['status'], 'READY');
  });

  it('parses Arduino Serial Plotter Key:Value and Key=Value streams with inline units', () => {
    const raw = 'Temp:25.4C, Humid:60.2%, RPM=-1450, State:ACTIVE';
    const frame = parseSerialPayloadDetailed(raw, 1700000000100);
    assert.ok(frame);
    assert.equal(frame.protocol, 'plotter');
    assert.equal(frame.values['Temp'], 25.4);
    assert.equal(frame.units['Temp'], '°C');
    assert.equal(frame.values['Humid'], 60.2);
    assert.equal(frame.units['Humid'], '%');
    assert.equal(frame.values['RPM'], -1450);
    assert.equal(frame.values['State'], 'ACTIVE');
  });

  it('parses raw CSV numeric streams into CH1..CHn and rejects non-numeric boot text', () => {
    const csvFrame = parseSerialPayloadDetailed('25.4, 60.2, 1023, -0.45');
    assert.ok(csvFrame);
    assert.equal(csvFrame.protocol, 'csv');
    assert.deepEqual(csvFrame.values, {
      CH1: 25.4,
      CH2: 60.2,
      CH3: 1023,
      CH4: -0.45,
    });

    // Boot banner or single number should not trigger false CSV channels
    assert.equal(parseSerialPayloadDetailed('rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)'), null);
    assert.equal(parseSerialPayload('hello world from esp32'), null);
  });

  it('preserves all intermediate high-rate samples in lossless batch ring-buffer extraction', () => {
    let widgets = new Map<string, WidgetConfig>();
    const frames = [
      parseSerialPayloadDetailed('{"adc": 100}', 1000)!,
      parseSerialPayloadDetailed('{"adc": 250}', 1010)!,
      parseSerialPayloadDetailed('{"adc": 512}', 1020)!,
      parseSerialPayloadDetailed('{"adc": 1023}', 1030)!,
    ];

    widgets = extractWidgetsFromBatch(frames, widgets, 3);
    const adcWidget = widgets.get('adc');
    assert.ok(adcWidget);
    assert.equal(adcWidget.value, 1023);
    // Ring buffer capped at maxHistory = 3 keeps the latest 3 samples in order
    assert.equal(adcWidget.history.length, 3);
    assert.deepEqual(
      adcWidget.history.map((pt) => pt.value),
      [250, 512, 1023]
    );
  });

  it('parses and formats hexadecimal byte frames accurately', () => {
    const bytes = parseHexInput('0xAA 55 01 FF');
    assert.ok(bytes);
    assert.deepEqual(Array.from(bytes), [0xaa, 0x55, 0x01, 0xff]);
    assert.equal(parseHexInput('AA 5'), null); // odd hex nybbles rejected
    assert.equal(toHexString('OK\n'), '4F 4B 0A');
    assert.equal(inferUnitFromKey('motor_rpm'), 'RPM');
  });
});

describe('OpenSerial Studio v2.0 — 4-Platform Firmware Code Generator', () => {
  const widgets = ['temp-c', '12v_bus'];
  const controls = [
    { id: 'led-1', type: 'button' as const },
    { id: 'fan_pwm', type: 'slider' as const },
  ];

  it('generates memory-safe Arduino C++ (ArduinoJson v7) without String heap fragmentation', () => {
    const code = generateArduinoCode(widgets, controls);
    assert.match(code, /static char rxBuffer\[256\];/);
    assert.doesNotMatch(code, /Serial\.readStringUntil/);
    assert.match(code, /doc\["led-1"\]\.is<int>\(\)/);
    assert.match(code, /const int led_1_PIN = 2;/);
    assert.match(code, /const int _12v_bus_PIN = A1;/);
  });

  it('generates zero-library Arduino Serial Plotter firmware', () => {
    const code = generateArduinoPlotterCode(widgets, controls);
    assert.doesNotMatch(code, /#include <ArduinoJson\.h>/);
    assert.match(code, /strstr\(line, "led-1"\)/);
    assert.match(code, /Serial\.print\("temp-c:"\)/);
  });

  it('generates STM32 HAL C with UART Idle DMA reception', () => {
    const code = generateSTM32Code(widgets, controls);
    assert.match(code, /HAL_UARTEx_ReceiveToIdle_DMA/);
    assert.match(code, /HAL_UARTEx_RxEventCallback/);
    assert.match(code, /snprintf\(txBuf, sizeof\(txBuf\)/);
  });

  it('generates MicroPython firmware with non-blocking select.poll and duty_u16 support', () => {
    const code = generateMicroPythonCode(widgets, controls);
    assert.match(code, /select\.poll\(\)/);
    assert.match(code, /duty_u16/);
    assert.match(code, /time\.ticks_diff/);
  });
});
