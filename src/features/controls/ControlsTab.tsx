import React, { useState, useRef, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { PlusCircle, SlidersHorizontal, Folder } from 'lucide-react';
import { useStudioStore } from '../../store/useStudioStore';
import { ControlCard } from './ControlCard';
import { EmptyState } from '../../components/shell/EmptyState';
import type { ControlConfig, WorkspaceTab } from '../../lib/workspace';
import { cn } from '../../lib/utils';

interface ControlsTabProps {
  isActive: boolean;
  onSend: (data: string) => void;
}

export const ControlsTab: React.FC<ControlsTabProps> = ({ isActive: _isActive, onSend }) => {
  const controls = useStudioStore((s) => s.controls);
  const setControls = useStudioStore((s) => s.setControls);
  const addControl = useStudioStore((s) => s.addControl);
  const updateControl = useStudioStore((s) => s.updateControl);
  const deleteControl = useStudioStore((s) => s.deleteControl);

  const [newControlId, setNewControlId] = useState('');
  const [newControlType, setNewControlType] = useState<'button' | 'slider' | 'toggle' | 'numeric'>('button');
  const [newControlGroup, setNewControlGroup] = useState('General');
  const [newControlPinTo, setNewControlPinTo] = useState<WorkspaceTab[]>(['controls']);
  const inputRef = useRef<HTMLInputElement>(null);

  // Setup DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = controls.findIndex((c) => c.id === active.id);
      const newIndex = controls.findIndex((c) => c.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        setControls(arrayMove(controls, oldIndex, newIndex));
      }
    }
  };

  const handleAddControl = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newControlId.trim();
    if (!cleaned) return;
    if (controls.some((c) => c.id === cleaned)) {
      setNewControlId('');
      return;
    }

    const newCtrl: ControlConfig = {
      id: cleaned,
      label: cleaned,
      type: newControlType,
      group: newControlGroup.trim() || 'General',
      pinTo: newControlPinTo.length > 0 ? newControlPinTo : ['controls'],
      min: newControlType === 'slider' ? 0 : undefined,
      max: newControlType === 'slider' ? 100 : undefined,
      step: newControlType === 'slider' ? 1 : undefined,
      value: newControlType === 'toggle' ? false : newControlType === 'numeric' ? 0 : undefined,
    };

    addControl(newCtrl);
    setNewControlId('');
    inputRef.current?.focus();
  };

  const togglePinNew = (tab: WorkspaceTab) => {
    setNewControlPinTo((prev) =>
      prev.includes(tab) ? prev.filter((t) => t !== tab) : [...prev, tab]
    );
  };

  // Group controls by group name
  const groupedControls = useMemo(() => {
    const groups: Record<string, ControlConfig[]> = {};
    for (const ctrl of controls) {
      const g = ctrl.group?.trim() || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push(ctrl);
    }
    return groups;
  }, [controls]);

  const controlIds = useMemo(() => controls.map((c) => c.id), [controls]);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-6 max-w-4xl mx-auto w-full">
      {/* 1. Header and Creator Form */}
      <div className="bg-[#111113] border border-white/[0.08] rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
              <span>Virtual Control Studio (TX)</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Create and manage controls to send JSON commands to your microcontroller.
            </p>
          </div>
          <span className="text-[11px] font-mono text-zinc-500 bg-zinc-900 border border-white/5 px-2 py-0.5 rounded">
            JSON + \n
          </span>
        </div>

        <form onSubmit={handleAddControl} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              ref={inputRef}
              value={newControlId}
              onChange={(e) =>
                setNewControlId(
                  e.target.value.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
                )
              }
              placeholder="Key / Var Name (e.g. KP_GAIN, LED_1)"
              className="flex-1 min-w-[160px] bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400 font-mono"
            />

            <select
              value={newControlType}
              onChange={(e) =>
                setNewControlType(
                  e.target.value as 'button' | 'slider' | 'toggle' | 'numeric'
                )
              }
              className="bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="button">Button (Momentary)</option>
              <option value="slider">Slider (Range)</option>
              <option value="toggle">Toggle (Latch ON/OFF)</option>
              <option value="numeric">Numeric (Exact Input)</option>
            </select>

            <input
              type="text"
              value={newControlGroup}
              onChange={(e) => setNewControlGroup(e.target.value)}
              placeholder="Group (e.g. PID, Camera)"
              className="w-32 bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400"
            />

            <button
              type="submit"
              className="flex items-center gap-1.5 bg-cyan-500 text-zinc-950 font-semibold px-4 py-2 rounded-lg text-xs hover:bg-cyan-400 transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Control</span>
            </button>
          </div>

          {/* Pin to Tabs Checkbox Pills */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] font-mono text-zinc-500">Pin to Inspector:</span>
            {(['telemetry', 'framebuffer', 'console'] as WorkspaceTab[]).map((tab) => {
              const isPinned = newControlPinTo.includes(tab);
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => togglePinNew(tab)}
                  className={cn(
                    'px-2 py-0.5 rounded text-[11px] font-mono transition-colors border',
                    isPinned
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-zinc-900 text-zinc-500 border-white/5 hover:text-zinc-300'
                  )}
                >
                  {isPinned ? 'âœ“ ' : '+ '}
                  {tab}
                </button>
              );
            })}
          </div>
        </form>
      </div>

      {/* 2. Grouped Sortable Controls List */}
      {controls.length === 0 ? (
        <EmptyState
          badge="Virtual Hardware Controls"
          title="No Controls Configured"
          description="Create sliders, buttons, toggles, or numeric inputs above to transmit parameter updates to your MCU without flashing new code."
          codeSnippet={`// Generated MCU command when clicked:\n{"LED_1": 1}\n\n// Generated MCU command when slider moved:\n{"KP_GAIN": 12.5}`}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={controlIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-6">
              {Object.entries(groupedControls).map(([groupName, groupItems]) => (
                <div key={groupName} className="space-y-3">
                  <div className="flex items-center gap-2 px-1 select-none">
                    <Folder className="w-3.5 h-3.5 text-zinc-500" />
                    <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                      {groupName}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-1.5 py-0.2 rounded border border-white/5">
                      {groupItems.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {groupItems.map((ctrl) => (
                      <ControlCard
                        key={ctrl.id}
                        control={ctrl}
                        onSend={onSend}
                        onUpdate={updateControl}
                        onDelete={deleteControl}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
};

