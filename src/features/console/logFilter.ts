import type { TerminalLogItem } from '../../components/widgets/TerminalLog';

export type StreamFilter = 'all' | 'rx' | 'tx' | 'mcp';

export interface LogFilterOptions {
  query: string;
  isRegex: boolean;
  isCaseSensitive: boolean;
  stream: StreamFilter;
}

export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

/**
 * Compiles a RegExp safely, falling back to null if syntax is invalid
 */
export function compileSafeRegex(pattern: string, isCaseSensitive: boolean): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, isCaseSensitive ? 'g' : 'gi');
  } catch {
    return null;
  }
}

/**
 * Evaluates whether a log item matches the stream filter
 */
export function matchesStream(item: TerminalLogItem, stream: StreamFilter): boolean {
  if (stream === 'all') return true;
  if (stream === 'rx') return !item.isTx && !item.isMcpTx;
  if (stream === 'tx') return item.isTx && !item.isMcpTx;
  if (stream === 'mcp') return Boolean(item.isMcpTx);
  return true;
}

/**
 * Evaluates whether a log item matches the query, regex, and stream options
 */
export function matchesLogFilter(item: TerminalLogItem, options: LogFilterOptions): boolean {
  if (!matchesStream(item, options.stream)) {
    return false;
  }

  const query = options.query.trim();
  if (!query) return true;

  if (options.isRegex) {
    const rx = compileSafeRegex(query, options.isCaseSensitive);
    if (rx) {
      return rx.test(item.text);
    }
    // Fall back to plain substring match on invalid regex
  }

  if (options.isCaseSensitive) {
    return item.text.includes(query);
  }
  return item.text.toLowerCase().includes(query.toLowerCase());
}

/**
 * Filters an array of logs and returns both the matching items and their indices
 */
export function filterLogs(
  logs: TerminalLogItem[],
  options: LogFilterOptions
): { filtered: TerminalLogItem[]; indices: number[] } {
  const filtered: TerminalLogItem[] = [];
  const indices: number[] = [];

  for (let i = 0; i < logs.length; i++) {
    const item = logs[i];
    if (matchesLogFilter(item, options)) {
      filtered.push(item);
      indices.push(i);
    }
  }

  return { filtered, indices };
}

/**
 * Splits text into highlighted segments for search matching
 */
export function highlightMatches(
  text: string,
  query: string,
  isRegex: boolean,
  isCaseSensitive: boolean
): HighlightSegment[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [{ text, isMatch: false }];
  }

  let rx: RegExp | null = null;
  if (isRegex) {
    rx = compileSafeRegex(trimmed, isCaseSensitive);
  }

  if (!rx) {
    // Escape regex characters for literal match
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rx = new RegExp(escaped, isCaseSensitive ? 'g' : 'gi');
  }

  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = rx.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        isMatch: false,
      });
    }

    segments.push({
      text: match[0],
      isMatch: true,
    });

    lastIndex = rx.lastIndex;
    if (match[0].length === 0) {
      rx.lastIndex++;
    }
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isMatch: false,
    });
  }

  return segments.length > 0 ? segments : [{ text, isMatch: false }];
}

/**
 * Formats a Date or timestamp as hh:mm:ss.mmm
 */
export function formatLogTimestamp(dateOrMs: Date | number = Date.now()): string {
  const d = typeof dateOrMs === 'number' ? new Date(dateOrMs) : dateOrMs;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}
