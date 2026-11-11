import React, { useState, useEffect } from 'react';
import { ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ToggleControlProps {
  id: string;
  label: string;
  initialValue?: boolean;
  value?: boolean;
  compact?: boolean;
  onSend: (data: string) => void;
  onValueChange?: (id: string, val: boolean) => void;
}

export const ToggleControl: React.FC<ToggleControlProps> = ({
  id,
  label,
  initialValue = false,
  value: controlledValue,
  compact = false,
  onSend,
  onValueChange,
}) => {
  const [isOn, setIsOn] = useState<boolean>(controlledValue ?? initialValue);

  useEffect(() => {
    if (typeof controlledValue === 'boolean') {
      setIsOn(controlledValue);
    }
  }, [controlledValue]);

  const handleToggle = () => {
    const next = !isOn;
    setIsOn(next);
    onValueChange?.(id, next);
    onSend(JSON.stringify({ [id]: next ? 1 : 0 }));
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between',
        compact ? 'py-0.5' : 'py-2'
      )}
    >
      <div className="flex flex-col min-w-0 pr-2">
        <span className="text-xs font-mono font-medium text-zinc-200 truncate">{label}</span>
        {!compact && <span className="text-[10px] font-mono text-zinc-500 truncate">{id}</span>}
      </div>

      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all select-none border',
          isOn
            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
            : 'bg-zinc-900 text-zinc-400 border-white/10 hover:border-white/20 hover:text-zinc-200'
        )}
      >
        {isOn ? (
          <>
            <ToggleRight className="w-4 h-4 text-cyan-400" />
            <span>ON</span>
          </>
        ) : (
          <>
            <ToggleLeft className="w-4 h-4 text-zinc-500" />
            <span>OFF</span>
          </>
        )}
      </button>
    </div>
  );
};
