import React from 'react';
import { X, ExternalLink, SlidersHorizontal, Settings2 } from 'lucide-react';
import { useStudioStore } from '../../store/useStudioStore';
import { ButtonControl } from '../../components/controls/ButtonControl';
import { SliderControl } from '../../components/controls/SliderControl';
import { ToggleControl } from '../../components/controls/ToggleControl';
import { NumericControl } from '../../components/controls/NumericControl';
import type { WorkspaceTab } from '../../lib/workspace';

interface InspectorProps {
  onSend: (data: string) => void;
}

const TAB_TITLES: Record<WorkspaceTab, string> = {
  telemetry: 'Telemetry & DSP',
  framebuffer: 'Framebuffer',
  console: 'Console & Sniffer',
  controls: 'Control Panel',
};

export const Inspector: React.FC<InspectorProps> = ({ onSend }) => {
  const activeTab = useStudioStore((s) => s.activeTab);
  const inspectorOpen = useStudioStore((s) => s.inspectorOpen);
  const toggleInspector = useStudioStore((s) => s.toggleInspector);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const controls = useStudioStore((s) => s.controls);
  const updateControl = useStudioStore((s) => s.updateControl);

  // Inspector is redundant on the Control Panel tab itself
  if (!inspectorOpen || activeTab === 'controls') return null;

  // Filter controls pinned to the active tab
  const pinnedControls = controls.filter((c) => {
    if (c.pinTo && c.pinTo.length > 0) {
      return c.pinTo.includes(activeTab);
    }
    // Heuristic fallback for standard demo presets
    if (activeTab === 'framebuffer') {
      return c.id.startsWith('cam_') || c.id.startsWith('light_');
    }
    if (activeTab === 'telemetry') {
      return (
        c.id.toLowerCase().includes('kp') ||
        c.id.toLowerCase().includes('pid') ||
        c.id.toLowerCase().includes('setpoint')
      );
    }
    return false;
  });

  return (
    <>
      {/* Mobile/Tablet Drawer Backdrop (below lg / 1024px) */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
        onClick={toggleInspector}
      />

      <aside className="w-80 shrink-0 border-l border-white/[0.08] bg-[#09090b] flex flex-col h-full z-30 select-none max-lg:fixed max-lg:right-0 max-lg:top-0 max-lg:bottom-0 max-lg:z-50 max-lg:shadow-2xl">
        {/* Inspector Header */}
        <div className="h-11 px-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-semibold text-zinc-200">
              Inspector · {TAB_TITLES[activeTab]}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleInspector}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Close Inspector (Hotkey: ])"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Inspector Body: Pinned Controls */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {pinnedControls.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-white/10 text-center flex flex-col items-center justify-center my-auto">
              <SlidersHorizontal className="w-6 h-6 text-zinc-600 mb-2" />
              <p className="text-xs font-medium text-zinc-400 mb-1">No Pinned Controls</p>
              <p className="text-[11px] text-zinc-500 leading-relaxed mb-4">
                Pin controls in the Control Panel to tweak parameters here without switching tabs.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('controls')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 hover:border-white/20 text-xs text-cyan-400 transition-colors"
              >
                <span>Manage Controls</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pb-1">
                <span>
                  {pinnedControls.length} pinned control{pinnedControls.length > 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('controls')}
                  className="hover:text-cyan-400 transition-colors flex items-center gap-1 text-[10px]"
                >
                  <span>Edit</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>
              </div>

              {pinnedControls.map((ctrl) => (
                <div
                  key={ctrl.id}
                  className="bg-[#111113] border border-white/[0.08] rounded-xl p-3 shadow-sm"
                >
                  {ctrl.type === 'button' && (
                    <ButtonControl id={ctrl.id} label={ctrl.label} onSend={onSend} />
                  )}

                  {ctrl.type === 'slider' && (
                    <SliderControl
                      id={ctrl.id}
                      label={ctrl.label}
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={typeof ctrl.value === 'number' ? ctrl.value : undefined}
                      onSend={onSend}
                      onValueChange={(id, val) => updateControl(id, { value: val })}
                      onConfigChange={(id, patch) => updateControl(id, patch)}
                      compact
                    />
                  )}

                  {ctrl.type === 'toggle' && (
                    <ToggleControl
                      id={ctrl.id}
                      label={ctrl.label}
                      value={Boolean(ctrl.value)}
                      onSend={onSend}
                      onValueChange={(id, val) => updateControl(id, { value: val })}
                      compact
                    />
                  )}

                  {ctrl.type === 'numeric' && (
                    <NumericControl
                      id={ctrl.id}
                      label={ctrl.label}
                      value={typeof ctrl.value === 'number' ? ctrl.value : 0}
                      unit={ctrl.unit}
                      step={ctrl.step ?? 1}
                      onSend={onSend}
                      onValueChange={(id, val) => updateControl(id, { value: val })}
                      compact
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
