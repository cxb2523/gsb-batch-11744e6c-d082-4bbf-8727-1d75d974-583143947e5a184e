import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeWorkspaceProfile,
  parseWorkspaceProfile,
  VALID_BUFFER_SIZES,
  DEFAULT_BUFFER_SIZE,
} from '../src/lib/workspace.ts';
import { toHexString } from '../src/lib/parser.ts';

describe('OpenSerial Studio — Workspace Persistence & Profile Serialization', () => {
  it('round-trips valid workspace profiles accurately', () => {
    const raw = serializeWorkspaceProfile(
      {
        baudRate: 921600,
        bufferSize: 512,
        controls: [
          { id: 'LED_1', label: 'LED_1', type: 'button' },
          { id: 'KP_GAIN', label: 'KP_GAIN', type: 'slider', min: -50, max: 50, step: 0.1 },
        ],
        widgetPrefs: {
          Signal_V: 'fft',
          Rotor_rpm: 'line',
        },
        demoPreset: 'dsp_harmonics',
      },
      'STM32 Lab Profile'
    );

    const parsed = parseWorkspaceProfile(raw);
    assert.ok(parsed);
    assert.equal(parsed.version, '3.2');
    assert.equal(parsed.name, 'STM32 Lab Profile');
    assert.equal(parsed.baudRate, 921600);
    assert.equal(parsed.bufferSize, 512);
    assert.equal(parsed.controls.length, 2);
    assert.equal(parsed.controls[1].min, -50);
    assert.equal(parsed.controls[1].max, 50);
    assert.equal(parsed.controls[1].step, 0.1);
    assert.equal(parsed.widgetPrefs['Signal_V'], 'fft');
    assert.equal(parsed.demoPreset, 'dsp_harmonics');
  });

  it('validates bufferSize across VALID_BUFFER_SIZES and falls back safely on invalid values', () => {
    for (const size of VALID_BUFFER_SIZES) {
      const raw = serializeWorkspaceProfile({
        baudRate: 115200,
        bufferSize: size,
        controls: [],
        widgetPrefs: {},
      });
      const parsed = parseWorkspaceProfile(raw);
      assert.ok(parsed);
      assert.equal(parsed.bufferSize, size);
    }

    // Non-standard or invalid buffer sizes must default to 128
    const invalidSizes = [-1, 0, 100, 300, 2048, 99999];
    for (const badSize of invalidSizes) {
      const dirty = JSON.stringify({
        baudRate: 115200,
        bufferSize: badSize,
        controls: [],
        widgetPrefs: {},
      });
      const parsed = parseWorkspaceProfile(dirty);
      assert.ok(parsed);
      assert.equal(parsed.bufferSize, DEFAULT_BUFFER_SIZE);
    }
  });

  it('sanitizes invalid fields, deduplicates control IDs, and rejects corrupt JSON', () => {
    assert.equal(parseWorkspaceProfile('not-json{{{'), null);
    assert.equal(parseWorkspaceProfile('[]'), null);

    const dirty = JSON.stringify({
      baudRate: -500,
      controls: [
        { id: 'PWM_1', type: 'slider', step: -2 },
        { id: 'PWM_1', type: 'button' }, // duplicate ID should be ignored
        { id: '', type: 'button' }, // empty ID should be ignored
      ],
      widgetPrefs: {
        Temp: 'fft',
        BadWidget: 'pie_chart_invalid',
      },
    });

    const sanitized = parseWorkspaceProfile(dirty);
    assert.ok(sanitized);
    assert.equal(sanitized.baudRate, 115200); // fallback default
    assert.equal(sanitized.controls.length, 1);
    assert.equal(sanitized.controls[0].id, 'PWM_1');
    assert.equal(sanitized.controls[0].step, undefined); // negative step stripped
    assert.deepEqual(sanitized.widgetPrefs, { Temp: 'fft' });
  });

  it('preserves true raw binary Uint8Array bytes without UTF-8 replacement corruption', () => {
    // Binary packet with Modbus CRC & high bytes (>= 0x80)
    const rawPacket = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0xC4, 0x0B, 0xFF, 0x80]);
    const hex = toHexString(rawPacket);

    assert.equal(hex, '01 03 00 00 00 02 C4 0B FF 80');
    // Ensure no replacement characters (EF BF BD) exist
    assert.ok(!hex.includes('EF BF BD'));
  });
});
