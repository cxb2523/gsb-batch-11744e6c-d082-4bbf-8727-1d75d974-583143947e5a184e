import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search,
  ChevronUp,
  ChevronDown,
  Copy,
  Download,
  Trash2,
  Send,
  Binary,
  Clock,
  ArrowDownToLine,
  Check,
} from 'lucide-react';
import { LogList } from './LogList';
import {
  type StreamFilter,
  filterLogs,
  compileSafeRegex,
} from './logFilter';
import { parseHexInput, toHexString } from '../../lib/parser';
import { useStudioStore } from '../../store/useStudioStore';
import type { TerminalLogItem, TerminalLogEntry } from '../../components/widgets/TerminalLog';
import { cn } from '../../lib/utils';

type LineEnding = '\n' | '\r\n' | '\r' | '';

interface ConsoleTabProps {
  logs: TerminalLogItem[];
  isActive: boolean;
  onClear: () => void;
  onSend: (payload: string) => void;
  onSendBytes: (bytes: Uint8Array, displayHex: string) => void;
}

export const ConsoleTab: React.FC<ConsoleTabProps> = ({
  isActive,
  onClear,
  onSend,
  onSendBytes,
}) => {
  const logBuffer = useStudioStore((s) => s.logBuffer);

  // Read full 10,000-line buffer periodically or on activity
  const [allLogs, setAllLogs] = useState<TerminalLogItem[]>(() => logBuffer.toArray());

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setAllLogs(logBuffer.toArray());
    }, 100);
    return () => clearInterval(interval);
  }, [isActive, logBuffer]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [streamFilter, setStreamFilter] = useState<StreamFilter>('all');

  // View Options State
  const [isHexView, setIsHexView] = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Search Match Navigation
  const [matchCursor, setMatchCursor] = useState(0);

  // Command Input State
  const [inputVal, setInputVal] = useState('');
  const [txMode, setTxMode] = useState<'ascii' | 'hex'>('ascii');
  const [lineEnding, setLineEnding] = useState<LineEnding>('\n');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [txError, setTxError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);

  // Hotkey support for / to focus search and Ctrl+L to clear
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        onClear();
        setAllLogs([]);
      } else if (
        e.key === '/' &&
        document.activeElement !== searchInputRef.current &&
        document.activeElement !== cmdInputRef.current
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onClear]);

  // Filter logs based on query and stream
  const { filteredLogs, matchingIndices } = useMemo(() => {
    // Normalize string items to entry items
    const normalized: TerminalLogItem[] = allLogs.map((l) =>
      typeof l === 'string' ? ({ text: l } as TerminalLogEntry) : l
    );

    const { filtered } = filterLogs(normalized, {
      query: searchQuery,
      isRegex,
      isCaseSensitive,
      stream: streamFilter,
    });

    // If there is an active search query, find which filtered lines contain matches
    const matchRowIndices: number[] = [];
    if (searchQuery.trim()) {
      const rx = isRegex
        ? compileSafeRegex(searchQuery.trim(), isCaseSensitive)
        : null;

      for (let i = 0; i < filtered.length; i++) {
        const text = isHexView && filtered[i].rawBytes
          ? toHexString(filtered[i].rawBytes)
          : filtered[i].text;

        if (rx) {
          if (rx.test(text)) matchRowIndices.push(i);
        } else {
          const match = isCaseSensitive
            ? text.includes(searchQuery.trim())
            : text.toLowerCase().includes(searchQuery.trim().toLowerCase());
          if (match) matchRowIndices.push(i);
        }
      }
    }

    return { filteredLogs: filtered, matchingIndices: matchRowIndices };
  }, [allLogs, searchQuery, isRegex, isCaseSensitive, streamFilter, isHexView]);

  // Handle Match Navigation
  const totalMatches = matchingIndices.length;
  const currentMatchRowIndex =
    totalMatches > 0 && matchCursor >= 0 && matchCursor < totalMatches
      ? matchingIndices[matchCursor]
      : undefined;

  const handleNextMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setMatchCursor((prev) => (prev + 1) % totalMatches);
  }, [totalMatches]);

  const handlePrevMatch = useCallback(() => {
    if (totalMatches === 0) return;
    setMatchCursor((prev) => (prev - 1 + totalMatches) % totalMatches);
  }, [totalMatches]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevMatch();
      } else {
        handleNextMatch();
      }
    }
  };

  // Copy visible logs to clipboard
  const handleCopyVisible = async () => {
    const text = filteredLogs
      .map((item) => (isHexView && item.rawBytes ? toHexString(item.rawBytes) : item.text))
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export visible logs as .log file
  const handleExportLog = () => {
    const text = filteredLogs
      .map((item) => (isHexView && item.rawBytes ? toHexString(item.rawBytes) : item.text))
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openserial_console_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Send Command
  const handleSubmitCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) return;

    setTxError(null);

    if (txMode === 'hex') {
      const bytes = parseHexInput(trimmed);
      if (!bytes) {
        setTxError('Invalid HEX string (e.g. AA 55 01 FF)');
        return;
      }
      const formattedHex = Array.from(bytes)
        .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ');
      onSendBytes(bytes, formattedHex);
    } else {
      onSend(inputVal + lineEnding);
    }

    setHistory((prev) => [inputVal, ...prev.slice(0, 29)]);
    setHistoryIdx(-1);
    setInputVal('');
  };

  const handleCommandKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault();
      const nextIdx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(nextIdx);
      setInputVal(history[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setInputVal(history[nextIdx]);
      } else {
        setHistoryIdx(-1);
        setInputVal('');
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#111113] border border-white/[0.08] rounded-xl overflow-hidden shadow-sm">
      {/* 1. Console Toolbar */}
      <div className="h-11 border-b border-white/[0.08] bg-[#09090b] px-3 flex items-center justify-between gap-2 text-xs select-none">
        {/* Left: Search input + navigation */}
        <div className="flex items-center gap-1.5 flex-1 max-w-md">
          <div className="relative flex items-center flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setMatchCursor(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search console (press / to focus)..."
              className="w-full bg-[#111113] border border-white/10 rounded-lg pl-8 pr-16 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400 font-mono"
            />
            {/* Regex and Case toggles inside search box */}
            <div className="absolute right-1.5 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsCaseSensitive(!isCaseSensitive)}
                className={cn(
                  'px-1 py-0.5 rounded text-[10px] font-mono transition-colors',
                  isCaseSensitive
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
                title="Match Case (Aa)"
              >
                Aa
              </button>
              <button
                type="button"
                onClick={() => setIsRegex(!isRegex)}
                className={cn(
                  'px-1 py-0.5 rounded text-[10px] font-mono transition-colors',
                  isRegex
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-zinc-500 hover:text-zinc-300'
                )}
                title="Use Regular Expression (.*)"
              >
                .*
              </button>
            </div>
          </div>

          {/* Match counter and prev/next buttons */}
          {searchQuery && (
            <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 shrink-0">
              <span>
                {totalMatches > 0 ? `${matchCursor + 1} of ${totalMatches}` : '0 matches'}
              </span>
              <button
                type="button"
                onClick={handlePrevMatch}
                disabled={totalMatches === 0}
                className="p-1 rounded hover:bg-zinc-800 disabled:opacity-40"
                title="Previous match (Shift+Enter)"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleNextMatch}
                disabled={totalMatches === 0}
                className="p-1 rounded hover:bg-zinc-800 disabled:opacity-40"
                title="Next match (Enter)"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Middle: Stream Filters */}
        <div className="flex items-center bg-[#111113] border border-white/[0.08] rounded-lg p-0.5 shrink-0">
          {(['all', 'rx', 'tx', 'mcp'] as StreamFilter[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setStreamFilter(mode)}
              className={cn(
                'px-2 py-0.5 rounded text-[11px] font-mono uppercase transition-colors',
                streamFilter === mode
                  ? 'bg-zinc-800 text-cyan-400 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Right: View Toggles & Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsHexView(!isHexView)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono border transition-colors',
              isHexView
                ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                : 'text-zinc-400 border-white/5 hover:bg-zinc-800'
            )}
            title="Toggle Hex View"
          >
            <Binary className="w-3 h-3" />
            <span>HEX</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTimestamps(!showTimestamps)}
            className={cn(
              'p-1.5 rounded text-zinc-400 hover:text-zinc-200 transition-colors',
              showTimestamps && 'text-cyan-400'
            )}
            title="Toggle Timestamps"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              'p-1.5 rounded transition-colors',
              autoScroll
                ? 'text-cyan-400'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
            title={autoScroll ? 'Autoscroll Active' : 'Autoscroll Paused'}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-3.5 bg-white/10 mx-0.5" />

          <button
            type="button"
            onClick={handleCopyVisible}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
            title="Copy visible log to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleExportLog}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors"
            title="Export .log file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              onClear();
              setAllLogs([]);
            }}
            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
            title="Clear console (Ctrl+L)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Virtualized Log Stream */}
      <LogList
        items={filteredLogs}
        searchQuery={searchQuery}
        isRegex={isRegex}
        isCaseSensitive={isCaseSensitive}
        isHexView={isHexView}
        showTimestamps={showTimestamps}
        autoScroll={autoScroll}
        activeMatchVirtualIndex={currentMatchRowIndex}
      />

      {/* 3. Command Input Bar */}
      <div className="border-t border-white/[0.08] bg-[#09090b] p-2.5">
        <form onSubmit={handleSubmitCommand} className="flex items-center gap-2">
          {/* Mode Selector */}
          <div className="flex items-center bg-[#111113] border border-white/10 rounded-lg p-0.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => setTxMode('ascii')}
              className={cn(
                'px-2 py-1 rounded transition-colors',
                txMode === 'ascii' ? 'bg-zinc-800 text-cyan-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              ASCII
            </button>
            <button
              type="button"
              onClick={() => setTxMode('hex')}
              className={cn(
                'px-2 py-1 rounded transition-colors',
                txMode === 'hex' ? 'bg-zinc-800 text-cyan-400 font-bold' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              HEX
            </button>
          </div>

          {/* Line Ending Selector (ASCII mode only) */}
          {txMode === 'ascii' && (
            <select
              value={lineEnding}
              onChange={(e) => setLineEnding(e.target.value as LineEnding)}
              className="bg-[#111113] border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-400 focus:outline-none focus:border-cyan-400"
            >
              <option value="\n">\n (LF)</option>
              <option value="\r\n">\r\n (CRLF)</option>
              <option value="\r">\r (CR)</option>
              <option value="">None</option>
            </select>
          )}

          {/* Command Input Field */}
          <div className="flex-1 relative">
            <input
              type="text"
              ref={cmdInputRef}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleCommandKeyDown}
              placeholder={
                txMode === 'hex'
                  ? 'Enter hex bytes (e.g. AA 55 01 FF)...'
                  : 'Type command or JSON payload (\u2191/\u2193 for history)...'
              }
              className="w-full bg-[#111113] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400 font-mono"
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 text-zinc-950 font-semibold text-xs hover:bg-cyan-400 transition-colors shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </form>

        {txError && (
          <p className="text-[11px] font-mono text-red-400 mt-1 pl-1">{txError}</p>
        )}
      </div>
    </div>
  );
};
