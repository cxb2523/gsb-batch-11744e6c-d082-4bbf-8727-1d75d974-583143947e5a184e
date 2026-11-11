import {
  parseSerialPayloadDetailed,
  HARDWARE_TIME_US_KEYS,
  HARDWARE_TIME_MS_KEYS,
  HARDWARE_SEQ_KEYS,
  type SerialProtocol,
} from './parser.ts';

/**
 * Stream Audit (分流审计)
 *
 * Pure-function auditor for the mixed binary/text telemetry stream described in
 * the README: 8-byte bit-packed pixel packets ([0xAA, 0x55, X&0xFF, Y&0xFF,
 * R, G, B, packed]) interleaved with UTF-8 text lines (JSON / Key:Value / CSV).
 *
 * The auditor is a stateless, snapshot-based counterpart to the stateful
 * StatefulBinaryDemuxer: it classifies every input byte exactly once
 * (pixel packet / text / incomplete trailing bytes), parses the remaining text
 * lines through parseSerialPayloadDetailed, and emits an ordered list of
 * consistency checks.
 *
 * Guarantees:
 * - No DOM access, no disk I/O, no mutation of the input bytes.
 * - Output is plain JSON-serializable data (no TypedArrays, no functions).
 * - Never throws on degenerate input (empty, half header, garbage text);
 *   returns a degraded result with a human-readable reason instead.
 */

export const PIXEL_PACKET_LENGTH = 8;
export const PIXEL_MAGIC_0 = 0xaa;
export const PIXEL_MAGIC_1 = 0x55;
export const LF_BYTE = 0x0a;
export const CR_BYTE = 0x0d;

export interface AuditedPixelFrame {
  /** Byte offset of the packet header inside the input snapshot. */
  byteOffset: number;
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  /** Low 6 bits of the packed byte (bits 6/7 carry the 9th bit of X / Y). */
  nodeId: number;
}

export interface AuditedTextLine {
  line: string;
  recognized: boolean;
  protocol: SerialProtocol | null;
  values: Record<string, number | string | boolean>;
  units: Record<string, string>;
  hardwareTimestampUs: number | null;
  sampleSeq: number | null;
  /** Human-readable reason when the line could not be parsed. */
  reason: string | null;
}

export interface AuditCheck {
  name: string;
  passed: boolean;
  /** Human-readable reason, present only when the check failed. */
  reason: string | null;
}

export interface StreamAuditOptions {
  /** Arrival timestamp (ms) handed to parseSerialPayloadDetailed. Defaults to 0 for determinism. */
  arrivalTimestampMs?: number;
  /** Widget history cap, echoed into the result for downstream consumers. */
  maxHistory?: number;
}

export interface StreamAuditResult {
  inputByteLength: number;
  arrivalTimestampMs: number;
  maxHistory: number | null;
  pixelFrames: AuditedPixelFrame[];
  /** Bytes left over that start a pixel packet but do not complete one (< 8). */
  trailingByteCount: number;
  textLines: AuditedTextLine[];
  checks: AuditCheck[];
  /** True when every check passed. */
  ok: boolean;
  /** True for degenerate/partial input (empty, trailing bytes, unrecognized lines, failed checks). */
  degraded: boolean;
  degradedReason: string | null;
}

type ByteClass = 'pixel' | 'text' | 'trailing';

const ALL_TIMEBASE_KEYS: readonly string[] = [
  ...HARDWARE_TIME_US_KEYS,
  ...HARDWARE_TIME_MS_KEYS,
  ...HARDWARE_SEQ_KEYS,
];

/**
 * Audits one raw byte snapshot, splitting 8-byte pixel packets from text lines
 * and verifying the split with an ordered list of checks.
 */
export function auditStream(bytes: Uint8Array, options: StreamAuditOptions = {}): StreamAuditResult {
  const arrivalTimestampMs = options.arrivalTimestampMs ?? 0;
  const maxHistory = options.maxHistory ?? null;
  const len = bytes.length;

  const pixelFrames: AuditedPixelFrame[] = [];
  const textBytes: number[] = [];
  const classification: Array<ByteClass | undefined> = new Array<ByteClass | undefined>(len);
  let trailingByteCount = 0;

  // --- Byte classification pass (read-only over `bytes`) ---
  let i = 0;
  while (i < len) {
    if (bytes[i] === PIXEL_MAGIC_0) {
      if (i + 1 >= len) {
        // Lone 0xAA at the very end: half a header, report as incomplete tail.
        classification[i] = 'trailing';
        trailingByteCount = 1;
        i = len;
        break;
      }
      if (bytes[i + 1] === PIXEL_MAGIC_1) {
        if (i + PIXEL_PACKET_LENGTH <= len) {
          const packed = bytes[i + 7];
          pixelFrames.push({
            byteOffset: i,
            x: bytes[i + 2] | (((packed >> 6) & 0x01) << 8),
            y: bytes[i + 3] | (((packed >> 7) & 0x01) << 8),
            r: bytes[i + 4],
            g: bytes[i + 5],
            b: bytes[i + 6],
            nodeId: packed & 0x3f,
          });
          for (let k = i; k < i + PIXEL_PACKET_LENGTH; k++) classification[k] = 'pixel';
          i += PIXEL_PACKET_LENGTH;
          continue;
        }
        // Header matched but fewer than 8 bytes remain: incomplete packet tail.
        for (let k = i; k < len; k++) classification[k] = 'trailing';
        trailingByteCount = len - i;
        i = len;
        break;
      }
      // 0xAA not followed by 0x55: not a packet, treat the byte as text.
    }
    classification[i] = 'text';
    textBytes.push(bytes[i]);
    i++;
  }

  // --- Text line extraction (0x0A bytes inside pixel packets never reach here) ---
  const textLines: AuditedTextLine[] = [];
  if (textBytes.length > 0) {
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(textBytes));
    for (const rawLine of decoded.split('\n')) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (line.trim() === '') continue;
      const frame = parseSerialPayloadDetailed(line, arrivalTimestampMs);
      if (frame) {
        textLines.push({
          line,
          recognized: true,
          protocol: frame.protocol,
          values: frame.values,
          units: frame.units,
          hardwareTimestampUs: frame.hardwareTimestampUs ?? null,
          sampleSeq: frame.sampleSeq ?? null,
          reason: null,
        });
      } else {
        textLines.push({
          line,
          recognized: false,
          protocol: null,
          values: {},
          units: {},
          hardwareTimestampUs: null,
          sampleSeq: null,
          reason: 'line does not match JSON, Key:Value/Key=Value, or CSV/TSV telemetry protocols',
        });
      }
    }
  }

  // --- Ordered consistency checks ---
  const checks: AuditCheck[] = [];

  // 1. Pixel packets must start with [0xAA, 0x55]; non-matching bytes go to text.
  {
    const badFrame = pixelFrames.find(
      (f) => bytes[f.byteOffset] !== PIXEL_MAGIC_0 || bytes[f.byteOffset + 1] !== PIXEL_MAGIC_1
    );
    checks.push({
      name: 'pixel-magic-header',
      passed: badFrame === undefined,
      reason:
        badFrame !== undefined
          ? `pixel frame at byte offset ${badFrame.byteOffset} does not start with [0xAA, 0x55]`
          : null,
    });
  }

  // 2. 0x0A bytes inside pixel packets must not be treated as text newlines.
  {
    let lfLeaked = false;
    for (const f of pixelFrames) {
      for (let k = f.byteOffset; k < f.byteOffset + PIXEL_PACKET_LENGTH; k++) {
        if (bytes[k] === LF_BYTE && classification[k] !== 'pixel') {
          lfLeaked = true;
          break;
        }
      }
      if (lfLeaked) break;
    }
    const lineContainsBreak = textLines.some((l) => l.line.includes('\n') || l.line.includes('\r'));
    const passed = !lfLeaked && !lineContainsBreak;
    checks.push({
      name: 'lf-inside-pixel-not-split',
      passed,
      reason: passed
        ? null
        : 'a 0x0A byte belonging to a pixel packet leaked into the text stream and caused a false line break',
    });
  }

  // 3. A trailing run shorter than 8 bytes must be reported, not silently dropped.
  {
    const classifiedTrailing = classification.filter((c) => c === 'trailing').length;
    const firstTrailing = classification.findIndex((c) => c === 'trailing');
    const consistent =
      classifiedTrailing === trailingByteCount &&
      trailingByteCount < PIXEL_PACKET_LENGTH &&
      (trailingByteCount === 0 ||
        (firstTrailing === len - trailingByteCount && bytes[firstTrailing] === PIXEL_MAGIC_0));
    checks.push({
      name: 'incomplete-tail-reported',
      passed: consistent,
      reason: consistent
        ? null
        : `input ends with ${classifiedTrailing} unclassifiable byte(s) that were not reported as an incomplete pixel packet`,
    });
  }

  // 4. Every byte is accounted for exactly once (no double counting, no silent loss).
  {
    const unclassified = classification.some((c) => c === undefined);
    const accounted =
      pixelFrames.length * PIXEL_PACKET_LENGTH + textBytes.length + trailingByteCount;
    const passed = !unclassified && accounted === len;
    checks.push({
      name: 'no-double-counting',
      passed,
      reason: passed
        ? null
        : `byte accounting mismatch: ${pixelFrames.length} pixel packet(s) + ${textBytes.length} text byte(s) + ${trailingByteCount} trailing byte(s) != ${len} input byte(s)`,
    });
  }

  // 5. Hardware timebase keys must be stripped from parsed values.
  {
    const offenders: string[] = [];
    for (const l of textLines) {
      if (!l.recognized) continue;
      for (const key of ALL_TIMEBASE_KEYS) {
        if (key in l.values) offenders.push(`"${key}" in line "${l.line}"`);
      }
      if (l.hardwareTimestampUs !== null && (!Number.isFinite(l.hardwareTimestampUs) || l.hardwareTimestampUs < 0)) {
        offenders.push(`invalid hardwareTimestampUs in line "${l.line}"`);
      }
      if (l.sampleSeq !== null && !Number.isFinite(l.sampleSeq)) {
        offenders.push(`invalid sampleSeq in line "${l.line}"`);
      }
    }
    const passed = offenders.length === 0;
    checks.push({
      name: 'hardware-timebase-stripped',
      passed,
      reason: passed
        ? null
        : `hardware timebase keys leaked into values: ${offenders.slice(0, 3).join('; ')}`,
    });
  }

  // 6. Every text line should be recognized by the telemetry parser.
  {
    const unrecognized = textLines.filter((l) => !l.recognized);
    const passed = unrecognized.length === 0;
    checks.push({
      name: 'text-lines-recognized',
      passed,
      reason: passed
        ? null
        : `${unrecognized.length} text line(s) not recognized as telemetry (first: "${unrecognized[0].line}")`,
    });
  }

  // --- Degradation summary ---
  const degradedReasons: string[] = [];
  if (len === 0) degradedReasons.push('input is empty; nothing to audit');
  if (trailingByteCount > 0) {
    degradedReasons.push(
      `${trailingByteCount} trailing byte(s) form an incomplete pixel packet (< ${PIXEL_PACKET_LENGTH} bytes)`
    );
  }
  const unrecognizedCount = textLines.filter((l) => !l.recognized).length;
  if (unrecognizedCount > 0) {
    degradedReasons.push(`${unrecognizedCount} text line(s) could not be recognized as telemetry`);
  }
  const failedChecks = checks.filter((c) => !c.passed);
  for (const c of failedChecks) {
    if (c.name !== 'text-lines-recognized' && c.reason) {
      degradedReasons.push(`check "${c.name}" failed: ${c.reason}`);
    }
  }

  return {
    inputByteLength: len,
    arrivalTimestampMs,
    maxHistory,
    pixelFrames,
    trailingByteCount,
    textLines,
    checks,
    ok: failedChecks.length === 0,
    degraded: degradedReasons.length > 0,
    degradedReason: degradedReasons.length > 0 ? degradedReasons.join('; ') : null,
  };
}
