export type SerialProtocol = 'json' | 'plotter' | 'csv';

export interface DataPoint {
  time: string;
  timestamp: number;
  value: number;
  hardwareTimestampUs?: number;
  sampleSeq?: number;
}

export interface WidgetConfig {
  id: string;
  value: number | string | boolean;
  label: string;
  type: 'chart' | 'gauge' | 'text' | 'boolean';
  unit?: string;
  displayType?: 'line' | 'bar' | 'gauge' | 'text';
  protocol?: SerialProtocol;
  history: DataPoint[];
}

export interface ParsedTelemetryFrame {
  protocol: SerialProtocol;
  values: Record<string, number | string | boolean>;
  units: Record<string, string>;
  timestamp: number;
  hardwareTimestampUs?: number;
  sampleSeq?: number;
}

const MAX_DEFAULT_HISTORY = 128;

const KNOWN_UNIT_SUFFIXES: Array<[RegExp, string]> = [
  [/_degc$/i, '°C'],
  [/_c$/i, '°C'],
  [/_f$/i, '°F'],
  [/_pct$/i, '%'],
  [/_percent$/i, '%'],
  [/_mv$/i, 'mV'],
  [/_v$/i, 'V'],
  [/_ma$/i, 'mA'],
  [/_a$/i, 'A'],
  [/_khz$/i, 'kHz'],
  [/_hz$/i, 'Hz'],
  [/_rpm$/i, 'RPM'],
  [/_hpa$/i, 'hPa'],
  [/_pa$/i, 'Pa'],
  [/_dbm$/i, 'dBm'],
  [/_db$/i, 'dB'],
  [/_ms$/i, 'ms'],
  [/_cm$/i, 'cm'],
  [/_mm$/i, 'mm'],
];

export function inferUnitFromKey(key: string): string | undefined {
  for (const [pattern, unit] of KNOWN_UNIT_SUFFIXES) {
    if (pattern.test(key)) {
      return unit;
    }
  }
  const lower = key.toLowerCase();
  if (lower === 'temp' || lower === 'temperature' || lower.endsWith('.temp')) return '°C';
  if (lower === 'humid' || lower === 'humidity' || lower.endsWith('.humidity')) return '%';
  if (lower === 'vbat' || lower === 'voltage' || lower === 'vrms' || lower === 'vcc') return 'V';
  if (lower === 'current' || lower === 'irms') return 'A';
  if (lower === 'rssi') return 'dBm';
  return undefined;
}

function formatTimeLabel(timestamp: number): string {
  const d = new Date(timestamp);
  const secs = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${secs}.${ms}`;
}

function flattenJsonPayload(
  obj: Record<string, unknown>,
  prefix = '',
  depth = 0,
  valuesOut: Record<string, number | string | boolean> = {},
  unitsOut: Record<string, string> = {}
): void {
  if (depth > 3) return;

  for (const [rawKey, rawVal] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${rawKey}` : rawKey;

    if (rawVal === null || rawVal === undefined) continue;

    if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
      valuesOut[key] = rawVal;
      const inferred = inferUnitFromKey(key);
      if (inferred) unitsOut[key] = inferred;
    } else if (typeof rawVal === 'boolean' || typeof rawVal === 'string') {
      // Check if string is a pure numeric string in JSON
      if (typeof rawVal === 'string' && rawVal.trim() !== '') {
        const num = Number(rawVal);
        if (!Number.isNaN(num) && Number.isFinite(num)) {
          valuesOut[key] = num;
          const inferred = inferUnitFromKey(key);
          if (inferred) unitsOut[key] = inferred;
          continue;
        }
      }
      valuesOut[key] = rawVal;
    } else if (typeof rawVal === 'object' && !Array.isArray(rawVal)) {
      const nestedObj = rawVal as Record<string, unknown>;
      // Support explicit { value: 25.4, unit: "°C" } telemetry object
      if ('value' in nestedObj && (typeof nestedObj.value === 'number' || typeof nestedObj.value === 'string' || typeof nestedObj.value === 'boolean')) {
        valuesOut[key] = nestedObj.value as number | string | boolean;
        if (typeof nestedObj.unit === 'string') {
          unitsOut[key] = nestedObj.unit;
        } else {
          const inferred = inferUnitFromKey(key);
          if (inferred) unitsOut[key] = inferred;
        }
      } else {
        flattenJsonPayload(nestedObj, key, depth + 1, valuesOut, unitsOut);
      }
    }
  }
}

/**
 * Parses Arduino Serial Plotter / Key:Value / Key=Value strings
 * Examples:
 *   "Temp:25.4,Humid:60.2,Motor:120"
 *   "Vrms=220.5 Irms=1.35 Status=READY"
 *   "pitch:1.23\troll:-0.45\tyaw:90.0"
 *   "/*Temp:25.4,Humid:60.2*\/"
 */
function parsePlotterKeyValue(trimmed: string): { values: Record<string, number | string | boolean>; units: Record<string, string> } | null {
  // Strip optional Serial Studio /* ... */ framing if present
  const clean = trimmed.replace(/^\/\*/, '').replace(/\*\/$/, '').trim();
  if (!clean.includes(':') && !clean.includes('=')) return null;

  // Split by comma, semicolon, pipe, tab, or whitespace around key:val pairs
  const tokens = clean.split(/[,;|\t]+|\s+(?=[A-Za-z_][A-Za-z0-9_.]*[:=])/);
  const values: Record<string, number | string | boolean> = {};
  const units: Record<string, string> = {};
  let validPairs = 0;
  let numericOrBoolPairs = 0;

  for (const token of tokens) {
    const pair = token.trim();
    if (!pair) continue;

    const match = pair.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*[:=]\s*(.+)$/);
    if (!match) return null;

    const key = match[1].trim();
    const rawValStr = match[2].trim();
    if (!key || !rawValStr) return null;

    // Reject hex register dumps (e.g. ESP32 boot ROM "rst:0x1", "SPIWP:0xee")
    if (/^0x[0-9a-fA-F]+/i.test(rawValStr)) return null;

    // Match number with optional unit suffix e.g. "25.4C", "3.31V", "-12.5"
    const numWithUnit = rawValStr.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-zA-Z%°]+)?$/i);
    if (numWithUnit) {
      const parsedNum = Number(numWithUnit[1]);
      if (Number.isFinite(parsedNum)) {
        values[key] = parsedNum;
        if (numWithUnit[2]) {
          units[key] = numWithUnit[2] === 'C' ? '°C' : numWithUnit[2] === 'F' ? '°F' : numWithUnit[2];
        } else {
          const inferred = inferUnitFromKey(key);
          if (inferred) units[key] = inferred;
        }
        validPairs++;
        numericOrBoolPairs++;
        continue;
      }
    }

    if (/^(true|false)$/i.test(rawValStr)) {
      values[key] = rawValStr.toLowerCase() === 'true';
      validPairs++;
      numericOrBoolPairs++;
      continue;
    }

    // Only allow clean single-token status words (no spaces/parentheses from log sentences)
    if (!/^[A-Za-z_][A-Za-z0-9_-]{0,23}$/.test(rawValStr)) {
      return null;
    }

    values[key] = rawValStr;
    validPairs++;
  }

  return validPairs > 0 && numericOrBoolPairs > 0 ? { values, units } : null;
}

/**
 * Parses raw numeric CSV / TSV streams (at least 2 numeric columns)
 * Example: "25.4, 60.2, 1023" -> { CH1: 25.4, CH2: 60.2, CH3: 1023 }
 */
function parseCsvStream(trimmed: string): Record<string, number> | null {
  const clean = trimmed.replace(/^\/\*/, '').replace(/\*\/$/, '').trim();
  const parts = clean.includes(',')
    ? clean.split(',')
    : clean.includes('\t')
      ? clean.split('\t')
      : null;

  if (!parts || parts.length < 2 || parts.length > 32) return null;

  const values: Record<string, number> = {};
  for (let i = 0; i < parts.length; i++) {
    const token = parts[i].trim();
    if (!token || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token)) {
      return null;
    }
    const num = Number(token);
    if (!Number.isFinite(num)) return null;
    values[`CH${i + 1}`] = num;
  }

  return values;
}

export const HARDWARE_TIME_US_KEYS = ['t_us', 'time_us', 'micros', 'timestamp_us', 't_usec'] as const;
export const HARDWARE_TIME_MS_KEYS = ['t_ms', 'time_ms', 'millis', 'timestamp_ms', 't_msec'] as const;
export const HARDWARE_SEQ_KEYS = ['seq', 'sample_idx', 'sample_seq', 'n'] as const;

export function extractHardwareTimebase(
  values: Record<string, number | string | boolean>,
  units: Record<string, string>,
  baseArrivalMs: number
): {
  hardwareTimestampUs?: number;
  sampleSeq?: number;
  effectiveTimestampMs: number;
} {
  let hardwareTimestampUs: number | undefined;
  let sampleSeq: number | undefined;

  // 1. Check for microsecond timestamps
  for (const k of HARDWARE_TIME_US_KEYS) {
    if (k in values && typeof values[k] === 'number' && Number.isFinite(values[k])) {
      const us = values[k] as number;
      if (us >= 0) {
        hardwareTimestampUs = us;
        delete values[k];
        delete units[k];
        break;
      }
    }
  }

  // 2. Check for millisecond timestamps if not already found in us
  if (hardwareTimestampUs === undefined) {
    for (const k of HARDWARE_TIME_MS_KEYS) {
      if (k in values && typeof values[k] === 'number' && Number.isFinite(values[k])) {
        const ms = values[k] as number;
        if (ms >= 0) {
          hardwareTimestampUs = ms * 1000;
          delete values[k];
          delete units[k];
          break;
        }
      }
    }
  }

  // 3. Check for sample sequence counter
  for (const k of HARDWARE_SEQ_KEYS) {
    if (k in values && typeof values[k] === 'number' && Number.isFinite(values[k])) {
      sampleSeq = Math.floor(values[k] as number);
      delete values[k];
      delete units[k];
      break;
    }
  }

  return {
    hardwareTimestampUs,
    sampleSeq,
    effectiveTimestampMs: baseArrivalMs,
  };
}

/**
 * Detailed multi-protocol telemetry parser:
 * Supports JSON (flat & nested), Arduino Serial Plotter (Key:Value / Key=Value), and Raw CSV streams.
 */
export function parseSerialPayloadDetailed(rawText: string, timestamp = Date.now()): ParsedTelemetryFrame | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  // 1. Try JSON (Flat or Nested)
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
        const values: Record<string, number | string | boolean> = {};
        const units: Record<string, string> = {};
        flattenJsonPayload(parsed as Record<string, unknown>, '', 0, values, units);
        const tb = extractHardwareTimebase(values, units, timestamp);
        if (Object.keys(values).length > 0) {
          return {
            protocol: 'json',
            values,
            units,
            timestamp: tb.effectiveTimestampMs,
            hardwareTimestampUs: tb.hardwareTimestampUs,
            sampleSeq: tb.sampleSeq,
          };
        }
      }
    } catch {
      // Fall through to non-JSON parsers
    }
  }

  // 2. Try Key:Value / Key=Value (Arduino Serial Plotter format)
  const kv = parsePlotterKeyValue(trimmed);
  if (kv) {
    const tb = extractHardwareTimebase(kv.values, kv.units, timestamp);
    if (Object.keys(kv.values).length > 0) {
      return {
        protocol: 'plotter',
        values: kv.values,
        units: kv.units,
        timestamp: tb.effectiveTimestampMs,
        hardwareTimestampUs: tb.hardwareTimestampUs,
        sampleSeq: tb.sampleSeq,
      };
    }
  }

  // 3. Try Raw CSV / TSV numeric stream
  const csv = parseCsvStream(trimmed);
  if (csv) {
    return {
      protocol: 'csv',
      values: csv,
      units: {},
      timestamp,
    };
  }

  return null;
}

/**
 * Backward-compatible payload parser returning flat key-value record.
 */
export function parseSerialPayload(rawText: string): Record<string, number | string | boolean> | null {
  const detailed = parseSerialPayloadDetailed(rawText);
  return detailed ? detailed.values : null;
}

/**
 * Updates widget map with a batch of parsed frames without dropping intermediate samples.
 */
export function extractWidgetsFromBatch(
  frames: ParsedTelemetryFrame[],
  currentWidgets: Map<string, WidgetConfig>,
  maxHistory = MAX_DEFAULT_HISTORY
): Map<string, WidgetConfig> {
  if (frames.length === 0) return currentWidgets;
  const nextWidgets = new Map(currentWidgets);

  for (const frame of frames) {
    const timeLabel = formatTimeLabel(frame.timestamp);

    for (const [key, value] of Object.entries(frame.values)) {
      let inferredType: WidgetConfig['type'] = 'text';
      if (typeof value === 'number') {
        inferredType = 'chart';
      } else if (typeof value === 'boolean') {
        inferredType = 'boolean';
      }

      const unit = frame.units[key] || inferUnitFromKey(key);
      const existing = nextWidgets.get(key);

      if (existing) {
        const updatedHistory =
          typeof value === 'number'
            ? [
                ...existing.history,
                {
                  time: timeLabel,
                  timestamp: frame.timestamp,
                  value,
                  hardwareTimestampUs: frame.hardwareTimestampUs,
                  sampleSeq: frame.sampleSeq,
                },
              ].slice(-maxHistory)
            : existing.history;

        nextWidgets.set(key, {
          ...existing,
          value,
          type: typeof value === 'number' ? 'chart' : existing.type,
          unit: unit ?? existing.unit,
          protocol: frame.protocol,
          history: updatedHistory,
        });
      } else {
        const initialHistory: DataPoint[] =
          typeof value === 'number'
            ? [
                {
                  time: timeLabel,
                  timestamp: frame.timestamp,
                  value,
                  hardwareTimestampUs: frame.hardwareTimestampUs,
                  sampleSeq: frame.sampleSeq,
                },
              ]
            : [];

        nextWidgets.set(key, {
          id: key,
          label: key.toUpperCase(),
          value,
          type: inferredType,
          unit,
          protocol: frame.protocol,
          history: initialHistory,
        });
      }
    }
  }

  return nextWidgets;
}

/**
 * Single-payload helper for backward compatibility.
 */
export function extractWidgetsFromPayload(
  payload: Record<string, number | string | boolean>,
  currentWidgets: Map<string, WidgetConfig>
): Map<string, WidgetConfig> {
  const timestamp = Date.now();
  const units: Record<string, string> = {};
  for (const k of Object.keys(payload)) {
    const u = inferUnitFromKey(k);
    if (u) units[k] = u;
  }
  return extractWidgetsFromBatch(
    [{ protocol: 'json', values: payload, units, timestamp }],
    currentWidgets
  );
}

/**
 * Converts a string or raw Uint8Array into space-separated uppercase hexadecimal byte pairs.
 */
export function toHexString(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return Array.from(bytes)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

/**
 * Parses a hexadecimal string (e.g. "AA 55 01 FF" or "0xAA 0x55") into a Uint8Array.
 * Returns null if the input is empty or does not contain an even number of hex digits.
 */
export function parseHexInput(raw: string): Uint8Array | null {
  const cleaned = raw.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
  if (!cleaned || cleaned.length % 2 !== 0) return null;
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    const byte = parseInt(cleaned.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i / 2] = byte;
  }
  return out;
}

