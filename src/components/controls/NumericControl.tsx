import React, { useState, useEffect } from 'react';
import { Send, Plus, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface NumericControlProps {
  id: string;
  label: string;
  initialValue?: number;
  value?: number;
  unit?: string;
  step?: number;
  compact?: boolean;
  onSend: (data: string) => void;
  onValueChange?: (id: string, val: number) => void;
}

export const NumericControl: React.FC<NumericControlProps> = ({
  id,
  label,
  initialValue = 0,
  value: controlledValue,
  unit,
  step = 1,
  compact = false,
  onSend,
  onValueChange,
}) => {
  const [val, setVal] = useState<number>(controlledValue ?? initialValue);
  const [rawText, setRawText] = useState<string>(String(controlledValue ?? initialValue));

  useEffect(() => {
    if (typeof controlledValue === 'number') {
      setVal(controlledValue);
      setRawText(String(controlledValue));
    }
  }, [controlledValue]);

  const sendValue = (targetVal: number) => {
    setVal(targetVal);
    setRawText(String(targetVal));
    onValueChange?.(id, targetVal);
    onSend(JSON.stringify({ [id]: targetVal }));
  };

  const handleCommit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(rawText);
    if (!Number.isNaN(num)) {
      sendValue(num);
    }
  };

  const handleStep = (delta: number) => {
    const next = Math.round((val + delta) * 1000) / 1000;
    sendValue(next);
  };

  return (
    <div
      className={cn(
        'flex flex-col space-y-1.5',
        compact ? 'py-0.5' : 'py-2'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-medium text-zinc-200 truncate">{label}</span>
        {unit && <span className="text-[10px] font-mono text-zinc-500">{unit}</span>}
      </div>

      <form onSubmit={handleCommit} className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => handleStep(-step)}
          className="p-1.5 rounded-md bg-zinc-900 border border-white/10 hover:border-white/20 text-zinc-400 hover:text-zinc-200"
          title={`Decrease by ${step}`}
        >
          <Minus className="w-3 h-3" />
        </button>

        <input
          type="number"
          step="any"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          className="flex-1 w-0 min-w-0 bg-[#09090b] border border-white/10 rounded-lg px-2.5 py-1 text-xs font-mono text-zinc-100 text-center focus:outline-none focus:border-cyan-400"
        />

        <button
          type="button"
          onClick={() => handleStep(step)}
          className="p-1.5 rounded-md bg-zinc-900 border border-white/10 hover:border-white/20 text-zinc-400 hover:text-zinc-200"
          title={`Increase by ${step}`}
        >
          <Plus className="w-3 h-3" />
        </button>

        <button
          type="submit"
          className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
          title="Send value (Enter)"
        >
          <Send className="w-3 h-3" />
        </button>
      </form>
    </div>
  );
};
