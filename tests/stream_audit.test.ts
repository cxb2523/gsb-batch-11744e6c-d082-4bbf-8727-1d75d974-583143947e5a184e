import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditStream,
  PIXEL_PACKET_LENGTH,
  type StreamAuditResult,
} from '../src/lib/streamAudit.ts';
import { parseSerialPayloadDetailed } from '../src/lib/parser.ts';

/**
 * Encodes an 8-byte pixel packet exactly per the README bit-packing rule:
 *   [0xAA, 0x55, X&0xFF, Y&0xFF, R, G, B, (nodeId&0x3F)|(((X>>8)&1)<<6)|(((Y>>8)&1)<<7)]
 */
function packPixel(x: number, y: number, r: number, g: number, b: number, nodeId: number): number[] {
  return [
    0xaa, 0x55,
    x & 0xff, y & 0xff,
    r, g, b,
    (nodeId & 0x3f) | (((x >> 8) & 0x01) << 6) | (((y >> 8) & 0x01) << 7),
  ];
}

/** Manually decodes x/y/nodeId from a raw packet, independent of the audit implementation. */
function manualDecode(packet: number[]): { x: number; y: number; nodeId: number } {
  const packed = packet[7];
  return {
    x: packet[2] | (((packed >> 6) & 0x01) << 8),
    y: packet[3] | (((packed >> 7) & 0x01) << 8),
    nodeId: packed & 0x3f,
  };
}

function textBytes(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

function buildStream(...parts: number[][]): Uint8Array {
  return new Uint8Array(parts.flat());
}

const TS = 1_700_000_000_000;

describe('OpenSerial Studio — Stream Audit (分流审计)', () => {
  it('normal path: two pixel packets interleaved with JSON and plotter lines, all checks pass', () => {
    const pkt1 = packPixel(10, 20, 255, 128, 64, 5);
    const pkt2 = packPixel(300, 400, 0, 200, 255, 63); // exercises 9th bits of X and Y
    const jsonLine = '{"t_us":1500,"seq":7,"Voltage_V":3.3,"nested":{"temp_degc":25.4}}';
    const plotterLine = 'Temp:25.4,Humid:60.2';

    const stream = buildStream(
      pkt1,
      textBytes(jsonLine + '\n'),
      pkt2,
      textBytes(plotterLine + '\n')
    );

    const audit = auditStream(stream, { arrivalTimestampMs: TS, maxHistory: 64 });

    // Pixel frames match the README bit-packing rule decoded by hand.
    assert.equal(audit.pixelFrames.length, 2);
    const m1 = manualDecode(pkt1);
    const m2 = manualDecode(pkt2);
    assert.deepEqual(
      audit.pixelFrames.map(({ x, y, nodeId }) => ({ x, y, nodeId })),
      [m1, m2]
    );
    assert.equal(audit.pixelFrames[0].r, 255);
    assert.equal(audit.pixelFrames[0].g, 128);
    assert.equal(audit.pixelFrames[0].b, 64);
    assert.equal(audit.pixelFrames[1].x, 300);
    assert.equal(audit.pixelFrames[1].y, 400);
    assert.equal(audit.pixelFrames[1].nodeId, 63);
    assert.equal(audit.pixelFrames[0].byteOffset, 0);
    assert.equal(audit.pixelFrames[1].byteOffset, pkt1.length + jsonLine.length + 1);

    // Text lines match direct parseSerialPayloadDetailed calls field-by-field.
    assert.equal(audit.textLines.length, 2);
    for (const audited of audit.textLines) {
      const direct = parseSerialPayloadDetailed(audited.line, TS);
      assert.ok(direct, `line should parse directly: ${audited.line}`);
      assert.equal(audited.recognized, true);
      assert.equal(audited.protocol, direct.protocol);
      assert.deepEqual(audited.values, direct.values);
      assert.deepEqual(audited.units, direct.units);
      assert.equal(audited.hardwareTimestampUs, direct.hardwareTimestampUs ?? null);
      assert.equal(audited.sampleSeq, direct.sampleSeq ?? null);
    }

    // Hardware timebase keys stripped from values, promoted to dedicated fields.
    const jsonAudited = audit.textLines[0];
    assert.equal(jsonAudited.protocol, 'json');
    assert.equal(jsonAudited.hardwareTimestampUs, 1500);
    assert.equal(jsonAudited.sampleSeq, 7);
    assert.ok(!('t_us' in jsonAudited.values));
    assert.ok(!('seq' in jsonAudited.values));
    assert.equal(jsonAudited.values['Voltage_V'], 3.3);
    assert.equal(jsonAudited.values['nested.temp_degc'], 25.4);
    assert.equal(audit.textLines[1].protocol, 'plotter');

    // No trailing bytes, every check passes, not degraded.
    assert.equal(audit.trailingByteCount, 0);
    assert.equal(audit.ok, true);
    assert.equal(audit.degraded, false);
    assert.equal(audit.degradedReason, null);
    assert.equal(audit.maxHistory, 64);
    for (const check of audit.checks) {
      assert.equal(check.passed, true, `check "${check.name}" should pass: ${check.reason}`);
    }
  });

  it('negative path: 0x0A coordinate/color bytes inside a pixel packet do not split text lines', () => {
    // x low byte = 0x0A (x = 10), r = 0x0A: both must survive as packet bytes.
    const pkt = packPixel(10, 0x0a, 0x0a, 20, 30, 1);
    assert.equal(pkt[2], 0x0a);
    assert.equal(pkt[3], 0x0a);
    assert.equal(pkt[4], 0x0a);

    const stream = buildStream(
      textBytes('Alpha:1\n'),
      pkt,
      textBytes('Beta:2\n')
    );

    const audit = auditStream(stream, { arrivalTimestampMs: TS });

    // Exactly one pixel frame, correctly decoded despite the 0x0A bytes.
    assert.equal(audit.pixelFrames.length, 1);
    assert.equal(audit.pixelFrames[0].x, 10);
    assert.equal(audit.pixelFrames[0].y, 0x0a);
    assert.equal(audit.pixelFrames[0].r, 0x0a);
    assert.equal(audit.pixelFrames[0].g, 20);
    assert.equal(audit.pixelFrames[0].b, 30);
    assert.equal(audit.pixelFrames[0].nodeId, 1);

    // Exactly two text lines — the packet's 0x0A bytes caused no false breaks.
    assert.equal(audit.textLines.length, 2);
    assert.deepEqual(
      audit.textLines.map((l) => l.line),
      ['Alpha:1', 'Beta:2']
    );
    assert.ok(audit.textLines.every((l) => l.recognized));

    const lfCheck = audit.checks.find((c) => c.name === 'lf-inside-pixel-not-split');
    assert.ok(lfCheck);
    assert.equal(lfCheck.passed, true);
    assert.equal(audit.ok, true);
    assert.equal(audit.degraded, false);
  });

  it('boundary: 7-byte truncated packet is reported as incomplete tail, not dropped or thrown', () => {
    const stream = new Uint8Array([0xaa, 0x55, 1, 2, 3, 4, 5]); // 7 of 8 bytes
    const audit = auditStream(stream, { arrivalTimestampMs: TS });

    assert.equal(audit.pixelFrames.length, 0);
    assert.equal(audit.trailingByteCount, 7);
    assert.equal(audit.textLines.length, 0);
    assert.equal(audit.degraded, true);
    assert.match(audit.degradedReason ?? '', /incomplete pixel packet/);
    const tailCheck = audit.checks.find((c) => c.name === 'incomplete-tail-reported');
    assert.ok(tailCheck);
    assert.equal(tailCheck.passed, true); // reported correctly -> check passes
  });

  it('boundary: empty input returns a degraded result without throwing', () => {
    const audit = auditStream(new Uint8Array(0));
    assert.equal(audit.inputByteLength, 0);
    assert.equal(audit.pixelFrames.length, 0);
    assert.equal(audit.textLines.length, 0);
    assert.equal(audit.trailingByteCount, 0);
    assert.equal(audit.ok, true);
    assert.equal(audit.degraded, true);
    assert.match(audit.degradedReason ?? '', /empty/);
  });

  it('boundary: lone 0xAA byte (half a header) degrades gracefully', () => {
    const audit = auditStream(new Uint8Array([0xaa]));
    assert.equal(audit.pixelFrames.length, 0);
    assert.equal(audit.trailingByteCount, 1);
    assert.equal(audit.textLines.length, 0);
    assert.equal(audit.degraded, true);
    assert.match(audit.degradedReason ?? '', /incomplete pixel packet/);
  });

  it('boundary: fully unrecognized text is flagged, not thrown', () => {
    const audit = auditStream(buildStream(textBytes('### not telemetry ###\n')), {
      arrivalTimestampMs: TS,
    });
    assert.equal(audit.textLines.length, 1);
    assert.equal(audit.textLines[0].recognized, false);
    assert.equal(audit.textLines[0].protocol, null);
    assert.ok(audit.textLines[0].reason);
    const recogCheck = audit.checks.find((c) => c.name === 'text-lines-recognized');
    assert.ok(recogCheck);
    assert.equal(recogCheck.passed, false);
    assert.match(recogCheck.reason ?? '', /not recognized/);
    assert.equal(audit.ok, false);
    assert.equal(audit.degraded, true);
  });

  it('non-magic bytes (0xAA not followed by 0x55) fall through to text handling', () => {
    // 0xAA 0x01 ... is not a packet header; the 0xAA byte is treated as text.
    const stream = buildStream([0xaa, 0x01], textBytes('K:1\n'));
    const audit = auditStream(stream, { arrivalTimestampMs: TS });
    assert.equal(audit.pixelFrames.length, 0);
    assert.equal(audit.trailingByteCount, 0);
    // The text stream contains the two stray bytes plus the line; the K:1 line is found.
    const lines = audit.textLines.map((l) => l.line);
    assert.ok(lines.some((l) => l.includes('K:1')));
  });

  it('audit output is JSON-serializable with no TypedArrays or functions', () => {
    const stream = buildStream(
      packPixel(1, 2, 3, 4, 5, 6),
      textBytes('{"t_ms":2,"a":1}\n'),
      [0xaa, 0x55, 9] // incomplete tail
    );
    const audit = auditStream(stream, { arrivalTimestampMs: TS, maxHistory: 32 });

    const json = JSON.stringify(audit);
    assert.equal(typeof json, 'string');
    const revived = JSON.parse(json) as StreamAuditResult;

    assert.deepEqual(revived.pixelFrames, audit.pixelFrames);
    assert.deepEqual(revived.textLines, audit.textLines);
    assert.deepEqual(revived.checks, audit.checks);
    assert.equal(revived.trailingByteCount, 3);
    assert.equal(revived.maxHistory, 32);

    // ms-based hardware timebase normalized to microseconds and stripped.
    assert.equal(audit.textLines[0].hardwareTimestampUs, 2000);
    assert.ok(!('t_ms' in audit.textLines[0].values));

    // No TypedArray anywhere in the output.
    const jsonText = JSON.stringify(audit);
    assert.ok(!jsonText.includes('"0":'), 'no TypedArray-like indexed objects in output');
  });

  it('does not mutate the input byte array', () => {
    const stream = buildStream(packPixel(7, 8, 9, 10, 11, 12), textBytes('A:1\n'), [0xaa]);
    const snapshot = new Uint8Array(stream);
    auditStream(stream, { arrivalTimestampMs: TS });
    assert.deepEqual(Array.from(stream), Array.from(snapshot));
  });

  it('packet length constant matches the README 8-byte frame', () => {
    assert.equal(PIXEL_PACKET_LENGTH, 8);
  });
});
