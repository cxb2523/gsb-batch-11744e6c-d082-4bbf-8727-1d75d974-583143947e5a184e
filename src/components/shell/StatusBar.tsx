import React, { useEffect, useState } from 'react';
import { useStudioStore } from '../../store/useStudioStore';
import { cn } from '../../lib/utils';

export const StatusBar: React.FC = () => {
  const status = useStudioStore((s) => s.status);
  const sourceMode = useStudioStore((s) => s.sourceMode);
  const demoPreset = useStudioStore((s) => s.demoPreset);
  const baudRate = useStudioStore((s) => s.baudRate);
  const activeProtocol = useStudioStore((s) => s.activeProtocol);
  const bridgeStatus = useStudioStore((s) => s.bridgeStatus);
  const lastRxLine = useStudioStore((s) => s.lastRxLine);
  const error = useStudioStore((s) => s.error);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const rateMeter = useStudioStore((s) => s.rateMeter);

  const [rates, setRates] = useState({ linesPerSec: 0, bytesPerSec: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      setRates(rateMeter.getRates());
    }, 500);
    return () => clearInterval(interval);
  }, [rateMeter]);

  const kbPerSec = (rates.bytesPerSec / 1024).toFixed(1);

  // Compute active port or source label
  let sourceLabel = 'No Port';
  if (sourceMode === 'demo') {
    sourceLabel = `demo://${demoPreset}`;
  } else if (sourceMode === 'bridge') {
    sourceLabel = bridgeStatus?.activePort || 'ws://127.0.0.1:8765';
  } else if (status === 'connected') {
    sourceLabel = 'USB CDC';
  }

  return (
    <div
      className={cn(
        'h-7 border-t border-white/[0.08] bg-[#09090b] px-3 flex items-center justify-between text-[11px] font-mono text-zinc-400 select-none z-20 transition-colors',
        error ? 'bg-red-950/40 text-red-300' : ''
      )}
    >
      {/* Left: Port, Baud, Protocol, Rates */}
      <div className="flex items-center gap-3 overflow-hidden">
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              status === 'connected' || sourceMode === 'demo'
                ? 'bg-emerald-400'
                : status === 'connecting'
                ? 'bg-amber-400 animate-pulse'
                : status === 'released_for_flash'
                ? 'bg-amber-400'
                : status === 'error'
                ? 'bg-red-400'
                : 'bg-zinc-600'
            )}
          />
          <span className="text-zinc-200 font-medium truncate max-w-[140px] sm:max-w-[200px]">
            {sourceLabel}
          </span>
        </div>

        <span className="text-zinc-600">·</span>
        <span className="shrink-0">{baudRate} bps</span>

        <span className="text-zinc-600">·</span>
        <span className="shrink-0 text-zinc-300">
          {activeProtocol ? activeProtocol.toUpperCase() : 'RAW'}
        </span>

        <span className="text-zinc-600 hidden sm:inline">·</span>
        <span className="shrink-0 hidden sm:inline text-cyan-400">
          {rates.linesPerSec} lines/s
        </span>

        <span className="text-zinc-600 hidden sm:inline">·</span>
        <span className="shrink-0 hidden sm:inline text-zinc-300">
          {kbPerSec} kB/s
        </span>

        <span className="text-zinc-600 hidden md:inline">·</span>
        <span className="shrink-0 hidden md:inline text-zinc-500">0 dropped</span>
      </div>

      {/* Right: Last RX Line (Click to jump to Console) */}
      <div className="flex items-center gap-2 overflow-hidden pl-4">
        {lastRxLine ? (
          <button
            type="button"
            onClick={() => setActiveTab('console')}
            title="Click to view full log in Console"
            className="flex items-center gap-1.5 truncate max-w-[200px] sm:max-w-[320px] md:max-w-[480px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 px-1.5 py-0.5 rounded transition-colors text-left"
          >
            <span className="text-zinc-600 shrink-0">RX:</span>
            <span className="truncate">{lastRxLine}</span>
          </button>
        ) : (
          <span className="text-zinc-600 italic">No incoming data</span>
        )}
      </div>
    </div>
  );
};
