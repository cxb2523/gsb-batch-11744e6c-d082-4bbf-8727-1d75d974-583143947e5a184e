import React, { useState, useEffect } from 'react';
import { Minus, Plus, SlidersHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SliderControlProps {
  id: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  compact?: boolean;
  onSend: (payload: string) => void;
  onValueChange?: (id: string, val: number) => void;
  onConfigChange?: (id: string, config: { min: number; max: number; step: number }) => void;
}

export const SliderControl: React.FC<SliderControlProps> = ({
  id,
  label,
  min: initialMin = 0,
  max: initialMax = 255,
  step: initialStep = 1,
  value: controlledValue,
  compact = false,
  onSend,
  onValueChange,
  onConfigChange,
}) => {
  const [min, setMin] = useState<number>(initialMin);
  const [max, setMax] = useState<number>(initialMax);
  const [step, setStep] = useState<number>(initialStep);
  const [value, setValue] = useState<number>(controlledValue ?? initialMin);
  const [showRangeConfig, setShowRangeConfig] = useState(false);

  useEffect(() => {
    setMin(initialMin);
  }, [initialMin]);

  useEffect(() => {
    setMax(initialMax);
  }, [initialMax]);

  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  useEffect(() => {
    if (typeof controlledValue === 'number') {
      setValue(controlledValue);
    }
  }, [controlledValue]);

  const sendValue = (nextVal: number) => {
    const clamped = Math.min(Math.max(nextVal, min), max);
    const rounded = Number(clamped.toFixed(4));
    setValue(rounded);
    onValueChange?.(id, rounded);
    // Send newline-terminated JSON payload (\n = 0x0A) to hardware
    onSend(JSON.stringify({ [id]: rounded }) + '\n');
  };

  const handleRelease = () => {
    sendValue(value);
  };

  const handleMinChange = (newMin: number) => {
    setMin(newMin);
    onConfigChange?.(id, { min: newMin, max, step });
  };

  const handleMaxChange = (newMax: number) => {
    setMax(newMax);
    onConfigChange?.(id, { min, max: newMax, step });
  };

  const handleStepChange = (newStep: number) => {
    if (newStep > 0) {
      setStep(newStep);
      onConfigChange?.(id, { min, max, step: newStep });
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        compact ? 'p-0 bg-transparent' : 'bg-zinc-900 border border-white/5 rounded-2xl p-4'
      )}
    >
      <div className="flex items-center justify-between">
        {!compact ? (
          <div className="flex flex-col">
            <span className="text-zinc-300 text-xs font-semibold uppercase tracking-wider">{label}</span>
            <span className="text-zinc-500 font-mono text-xs">{id}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-mono text-zinc-300 truncate">{label}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => sendValue(value - step)}
            className="p-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10 transition-colors"
            title={`Decrease by ${step}`}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="min-w-[3rem] text-center text-sm font-bold font-mono text-cyan-400">
            {value}
          </span>
          <button
            type="button"
            onClick={() => sendValue(value + step)}
            className="p-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/10 transition-colors"
            title={`Increase by ${step}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowRangeConfig(!showRangeConfig)}
            className={cn(
              'p-1 rounded-md border transition-colors ml-0.5',
              showRangeConfig
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                : 'bg-zinc-900 border-white/10 text-zinc-500 hover:text-zinc-300'
            )}
            title="Configure Min / Max / Step"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showRangeConfig && (
        <div className="grid grid-cols-3 gap-2 pt-1 pb-2 border-y border-white/5 text-xs font-mono">
          <div>
            <label className="text-[10px] text-zinc-500 block mb-1">MIN</label>
            <input
              type="number"
              value={min}
              onChange={(e) => handleMinChange(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-white/10 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 block mb-1">MAX</label>
            <input
              type="number"
              value={max}
              onChange={(e) => handleMaxChange(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-white/10 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 block mb-1">STEP</label>
            <input
              type="number"
              step="any"
              min="0.001"
              value={step}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v > 0) handleStepChange(v);
              }}
              className="w-full bg-zinc-950 border border-white/10 rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>
      )}

      <div className="relative w-full h-5 flex items-center">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => setValue(parseFloat(e.target.value))}
          onMouseUp={handleRelease}
          onTouchEnd={handleRelease}
          className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:accent-cyan-300 transition-all focus:outline-none"
        />
      </div>
      <div className="flex justify-between text-[11px] text-zinc-600 font-mono">
        <span>{min}</span>
        <span>step: {step}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};
