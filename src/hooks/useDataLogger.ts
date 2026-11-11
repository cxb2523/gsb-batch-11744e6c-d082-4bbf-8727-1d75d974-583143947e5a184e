import { useState, useCallback, useRef } from 'react';

function escapeCsvCell(val: unknown): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const DEFAULT_MAX_LOG_RECORDS = 100_000;

export interface DataLoggerOptions {
  maxRecords?: number;
}

export function appendDataLoggerRecord(
  buffer: Array<Record<string, unknown>>,
  data: Record<string, unknown>,
  maxRecords: number = DEFAULT_MAX_LOG_RECORDS,
  timestamp?: string
): void {
  if (buffer.length >= maxRecords) {
    buffer.shift();
  }
  buffer.push({ _timestamp: timestamp ?? new Date().toISOString(), ...data });
}

export function useDataLogger(options?: DataLoggerOptions) {
  const maxRecords = options?.maxRecords ?? DEFAULT_MAX_LOG_RECORDS;
  const [isRecording, setIsRecording] = useState(false);
  const [logCount, setLogCount] = useState(0);
  const loggedDataRef = useRef<Array<Record<string, unknown>>>([]);
  const isRecordingRef = useRef(false);

  const startRecording = useCallback(() => {
    setIsRecording(true);
    isRecordingRef.current = true;
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    isRecordingRef.current = false;
    setLogCount(loggedDataRef.current.length);
  }, []);

  const clearLog = useCallback(() => {
    loggedDataRef.current = [];
    setLogCount(0);
  }, []);

  const logData = useCallback(
    (data: Record<string, unknown>) => {
      if (isRecordingRef.current) {
        appendDataLoggerRecord(loggedDataRef.current, data, maxRecords);
        if (loggedDataRef.current.length === 1 || loggedDataRef.current.length % 10 === 0) {
          setLogCount(loggedDataRef.current.length);
        }
      }
    },
    [maxRecords]
  );

  const exportCSV = useCallback(() => {
    if (loggedDataRef.current.length === 0) return;

    const keys = new Set<string>();
    keys.add('_timestamp');
    loggedDataRef.current.forEach((row) => {
      Object.keys(row).forEach((k) => keys.add(k));
    });

    const headers = Array.from(keys);
    const lines: string[] = [headers.map(escapeCsvCell).join(',')];

    loggedDataRef.current.forEach((row) => {
      lines.push(headers.map((header) => escapeCsvCell(row[header])).join(','));
    });

    const csv = lines.join('\n') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openserial_log_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    clearLog,
    exportCSV,
    logData,
    logCount,
  };
}
