import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Trash2, Send, Pause, Play, Binary } from 'lucide-react';
import { parseHexInput, toHexString } from '../../lib/parser';

export interface TerminalLogEntry {
  text: string;
  isTx?: boolean;
  isMcpTx?: boolean;
  rawBytes?: Uint8Array;
  timestamp?: string;
}

export type TerminalLogItem = string | TerminalLogEntry;

type LineEnding = '\n' | '\r\n' | '\r' | '';

interface TerminalLogProps {
  logs: TerminalLogItem[];
  onClear: () => void;
  onSend?: (payload: string) => void;
  onSendBytes?: (bytes: Uint8Array, displayHex: string) => void;
}

export const TerminalLog: React.FC<TerminalLogProps> = ({
  logs,
  onClear,
  onSend,
  onSendBytes,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [hexView, setHexView] = useState(false);
  const [txMode, setTxMode] = useState<'ascii' | 'hex'>('ascii');
  const [lineEnding, setLineEnding] = useState<LineEnding>('\n');
  const [inputVal, setInputVal] = useState('');
  const [txError, setTxError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) return;

    setTxError(null);

    if (txMode === 'hex') {
      const bytes = parseHexInput(trimmed);
      if (!bytes) {
        setTxError('Invalid HEX string (use even hex digits, e.g. AA 55 01 FF)');
        return;
      }
      const formattedHex = Array.from(bytes)
        .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ');
      if (onSendBytes) {
        onSendBytes(bytes, formattedHex);
      } else if (onSend) {
        onSend(new TextDecoder().decode(bytes));
      }
    } else if (onSend) {
      onSend(inputVal + lineEnding);
    }

    setHistory((prev) => [inputVal, ...prev.slice(0, 29)]);
    setHistoryIdx(-1);
    setInputVal('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    <div className="flex flex-col bg-zinc-900 border border-white/5 rounded-2xl overflow-hidden h-80">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-zinc-900/50">
        <div className="flex items-center gap-2 text-zinc-400">
          <Terminal className="w-4 h-4 text-accent-blue" />
          <h3 className="text-sm font-semibold text-zinc-300">Serial Console</h3>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
            {logs.length} lines
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setHexView(!hexView)}
            className={`px-2 py-1 rounded text-[11px] font-mono flex items-center gap-1 transition-colors border ${
              hexView
                ? 'bg-accent-blue/15 text-accent-blue border-accent-blue/40'
                : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-white/5'
            }`}
            title="Toggle HEX Inspector"
          >
            <Binary className="w-3.5 h-3.5" />
            HEX
          </button>

          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1.5 rounded-md transition-colors ${
              !autoScroll
                ? 'bg-amber-500/15 text-amber-400'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            }`}
            title={autoScroll ? 'Pause Auto-Scroll' : 'Resume Auto-Scroll'}
          >
            {autoScroll ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onClear}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1.5 rounded-md hover:bg-white/5"
            title="Clear Console"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log Stream */}
      <div
        ref={scrollRef}
        className="flex-1 p-3 overflow-y-auto font-mono text-xs text-zinc-400 space-y-1.5 bg-zinc-950/40"
      >
        {logs.length === 0 ? (
          <div className="text-zinc-600 italic py-6 text-center">
            No serial packets captured yet...
          </div>
        ) : (
          logs.map((log, i) => {
            let isTx = false;
            let isMcpTx = false;
            let cleanText = '';
            let rawBytes: Uint8Array | undefined;

            if (typeof log === 'string') {
              isMcpTx = log.startsWith('[MCP TX] ') || log.startsWith('>[MCP] ');
              isTx = isMcpTx || log.startsWith('> ');
              cleanText = isTx && log.startsWith('> ') ? log.slice(2).trimEnd() : log;
            } else {
              isMcpTx = Boolean(log.isMcpTx || log.text.startsWith('[MCP TX] '));
              isTx = isMcpTx || (log.isTx ?? log.text.startsWith('> '));
              cleanText = isTx && log.text.startsWith('> ') ? log.text.slice(2).trimEnd() : log.text;
              rawBytes = log.rawBytes;
            }

            const displayPayload = hexView
              ? rawBytes
                ? toHexString(rawBytes)
                : toHexString(cleanText)
              : cleanText;

            return (
              <div key={i} className="break-all flex items-start gap-1.5 leading-relaxed">
                <span
                  className={`text-[10px] font-bold px-1 rounded mt-0.5 select-none ${
                    isMcpTx
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.25)]'
                      : isTx
                      ? 'bg-accent-green/15 text-accent-green border border-accent-green/30'
                      : 'bg-accent-blue/15 text-accent-blue border border-accent-blue/30'
                  }`}
                >
                  {isMcpTx ? 'MCP TX' : isTx ? 'TX' : 'RX'}
                </span>
                <span className={isMcpTx ? 'text-purple-300 font-semibold' : isTx ? 'text-accent-green' : 'text-zinc-200'}>
                  {displayPayload}
                </span>
              </div>
            );
          })
        )}
      </div>

      {txError && (
        <div className="px-3 py-1 bg-red-500/15 border-t border-red-500/30 text-[11px] text-red-400 font-mono">
          {txError}
        </div>
      )}

      {/* Interactive Command Transmitter */}
      <form
        onSubmit={handleSubmit}
        className="p-2 border-t border-white/5 bg-zinc-900/80 flex items-center gap-1.5"
      >
        <button
          type="button"
          onClick={() => {
            setTxMode(txMode === 'ascii' ? 'hex' : 'ascii');
            setTxError(null);
          }}
          className={`px-2 py-1.5 rounded-lg text-[11px] font-mono font-semibold border transition-colors ${
            txMode === 'hex'
              ? 'bg-purple-500/15 text-purple-300 border-purple-500/40'
              : 'bg-zinc-950 text-zinc-400 border-white/10 hover:text-zinc-200'
          }`}
          title="Switch between ASCII string and raw HEX byte transmission"
        >
          {txMode === 'hex' ? 'HEX' : 'TXT'}
        </button>

        <input
          type="text"
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value);
            if (txError) setTxError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            txMode === 'hex'
              ? 'Send HEX bytes (e.g. AA 55 01 FF)'
              : 'Send command (e.g. {"LED_1":1} or AT+RST)'
          }
          className="flex-1 min-w-0 bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-accent-blue"
        />

        {txMode === 'ascii' && (
          <select
            value={lineEnding === '\n' ? 'lf' : lineEnding === '\r\n' ? 'crlf' : lineEnding === '\r' ? 'cr' : 'none'}
            onChange={(e) => {
              const v = e.target.value;
              setLineEnding(v === 'lf' ? '\n' : v === 'crlf' ? '\r\n' : v === 'cr' ? '\r' : '');
            }}
            className="bg-zinc-950 border border-white/10 rounded-lg px-1.5 py-1.5 text-[11px] font-mono text-zinc-400 focus:outline-none focus:border-accent-blue"
            title="Line Ending"
          >
            <option value="lf">\n (LF)</option>
            <option value="crlf">\r\n</option>
            <option value="cr">\r (CR)</option>
            <option value="none">None</option>
          </select>
        )}

        <button
          type="submit"
          className="p-1.5 rounded-lg bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25 border border-accent-blue/30 transition-colors"
          title="Send over UART"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
