import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Settings2, Pin } from 'lucide-react';
import { ButtonControl } from '../../components/controls/ButtonControl';
import { SliderControl } from '../../components/controls/SliderControl';
import { ToggleControl } from '../../components/controls/ToggleControl';
import { NumericControl } from '../../components/controls/NumericControl';
import type { ControlConfig, WorkspaceTab } from '../../lib/workspace';
import { cn } from '../../lib/utils';

interface ControlCardProps {
  control: ControlConfig;
  onSend: (data: string) => void;
  onUpdate: (id: string, patch: Partial<ControlConfig>) => void;
  onDelete: (id: string) => void;
}

const TAB_OPTIONS: { id: WorkspaceTab; label: string }[] = [
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'framebuffer', label: 'Framebuffer' },
  { id: 'console', label: 'Console' },
];

export const ControlCard: React.FC<ControlCardProps> = ({
  control,
  onSend,
  onUpdate,
  onDelete,
}) => {
  const [showConfig, setShowConfig] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: control.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const togglePin = (tab: WorkspaceTab) => {
    const current = control.pinTo || [];
    const next = current.includes(tab)
      ? current.filter((t) => t !== tab)
      : [...current, tab];
    onUpdate(control.id, { pinTo: next });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative bg-[#111113] border rounded-xl transition-all shadow-sm',
        isDragging
          ? 'border-cyan-400/50 shadow-lg bg-zinc-900 opacity-90'
          : 'border-white/[0.08] hover:border-white/20'
      )}
    >
      {/* Card Header: Drag handle, label/type, pin badge, settings & delete buttons */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04] bg-zinc-950/40 rounded-t-xl select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
            title="Drag to reorder"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>

          <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400 border border-white/5">
            {control.type}
          </span>

          <span className="text-xs font-mono font-medium text-zinc-200 truncate">
            {control.label}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {control.pinTo && control.pinTo.length > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.2 rounded">
              <Pin className="w-2.5 h-2.5 text-cyan-400" />
              <span>{control.pinTo.join(', ')}</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className={cn(
              'p-1 text-zinc-500 hover:text-zinc-200 rounded transition-colors',
              showConfig && 'text-cyan-400 bg-zinc-800'
            )}
            title="Configure Control"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onDelete(control.id)}
            className="p-1 text-zinc-600 hover:text-red-400 rounded transition-colors"
            title="Delete Control"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Control Surface */}
      <div className="p-3">
        {control.type === 'button' && (
          <ButtonControl id={control.id} label={control.label} onSend={onSend} />
        )}

        {control.type === 'slider' && (
          <SliderControl
            id={control.id}
            label={control.label}
            min={control.min}
            max={control.max}
            step={control.step}
            value={typeof control.value === 'number' ? control.value : undefined}
            onSend={onSend}
            onValueChange={(id, val) => onUpdate(id, { value: val })}
            onConfigChange={(id, patch) => onUpdate(id, patch)}
            compact
          />
        )}

        {control.type === 'toggle' && (
          <ToggleControl
            id={control.id}
            label={control.label}
            value={Boolean(control.value)}
            onSend={onSend}
            onValueChange={(id, val) => onUpdate(id, { value: val })}
            compact
          />
        )}

        {control.type === 'numeric' && (
          <NumericControl
            id={control.id}
            label={control.label}
            value={typeof control.value === 'number' ? control.value : 0}
            unit={control.unit}
            step={control.step ?? 1}
            onSend={onSend}
            onValueChange={(id, val) => onUpdate(id, { value: val })}
            compact
          />
        )}
      </div>

      {/* Collapsible Configuration Drawer */}
      {showConfig && (
        <div className="px-3 pb-3 pt-1 border-t border-white/[0.04] bg-zinc-950/60 rounded-b-xl text-xs space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">
                Display Label
              </label>
              <input
                type="text"
                value={control.label}
                onChange={(e) => onUpdate(control.id, { label: e.target.value })}
                className="w-full bg-[#09090b] border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">
                Group
              </label>
              <input
                type="text"
                value={control.group || 'General'}
                onChange={(e) => onUpdate(control.id, { group: e.target.value })}
                className="w-full bg-[#09090b] border border-white/10 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* Pin to Tabs */}
          <div>
            <label className="text-[10px] font-mono text-zinc-500 uppercase block mb-1">
              Pin to Inspector in Tabs:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {TAB_OPTIONS.map((t) => {
                const isPinned = (control.pinTo || []).includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => togglePin(t.id)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-mono transition-colors border',
                      isPinned
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        : 'bg-zinc-900 text-zinc-500 border-white/5 hover:border-white/10 hover:text-zinc-300'
                    )}
                  >
                    {isPinned ? '✓ ' : '+ '}
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
