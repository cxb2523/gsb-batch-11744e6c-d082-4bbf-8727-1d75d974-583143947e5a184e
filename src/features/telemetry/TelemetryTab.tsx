import React, { useState } from 'react';
import { RotateCcw, LayoutGrid, Columns2, Square } from 'lucide-react';
import { useStudioStore } from '../../store/useStudioStore';
import { ChartWidget } from '../../components/widgets/ChartWidget';
import { TextWidget } from '../../components/widgets/TextWidget';
import { EmptyState } from '../../components/shell/EmptyState';
import { cn } from '../../lib/utils';

interface TelemetryTabProps {
  isActive: boolean;
  onClearDashboard: () => void;
  onSelectDemo: (preset: 'dsp_harmonics' | 'pid_motor' | 'iot_env') => void;
}

export const TelemetryTab: React.FC<TelemetryTabProps> = ({
  isActive: _isActive,
  onClearDashboard,
  onSelectDemo,
}) => {
  const widgets = useStudioStore((s) => s.widgets);
  const widgetPrefs = useStudioStore((s) => s.widgetPrefs);
  const setWidgetPref = useStudioStore((s) => s.setWidgetPref);
  const bufferSize = useStudioStore((s) => s.bufferSize);
  const baudRate = useStudioStore((s) => s.baudRate);
  const activeProtocol = useStudioStore((s) => s.activeProtocol);

  const [columns, setColumns] = useState<1 | 2 | 3>(2);

  const widgetList = Array.from(widgets.values());

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      {/* Telemetry Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Telemetry Channels
          </span>
          {activeProtocol && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              {activeProtocol}
            </span>
          )}
          <span className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-white/5">
            N = {bufferSize}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-500 bg-zinc-900 border border-white/5">
            {baudRate} bps
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Column Layout Selector */}
          <div className="flex items-center bg-[#111113] border border-white/[0.08] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setColumns(1)}
              className={cn(
                'p-1 rounded text-xs transition-colors',
                columns === 1 ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              )}
              title="Single Column View"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setColumns(2)}
              className={cn(
                'p-1 rounded text-xs transition-colors',
                columns === 2 ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              )}
              title="Two Columns View"
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setColumns(3)}
              className={cn(
                'p-1 rounded text-xs transition-colors',
                columns === 3 ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              )}
              title="Three Columns View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          {widgetList.length > 0 && (
            <button
              type="button"
              onClick={onClearDashboard}
              title="Clear captured waveforms"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-zinc-400 hover:text-zinc-100 bg-[#111113] hover:bg-zinc-800 border border-white/[0.08] rounded-lg transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {widgetList.length === 0 ? (
        <EmptyState
          badge="Telemetry Stream"
          title="No Telemetry Frames Received"
          description="Connect your MCU via Web Serial (or local bridge) and transmit JSON, Arduino Serial Plotter, or raw CSV packets."
          codeSnippet={`// 1. JSON Telemetry\n{"Signal_V": 3.14, "Vibration_g": 0.85}\n\n// 2. Arduino Serial Plotter\nTemp:24.5,Humid:60.2,Vbat:3.8\n\n// 3. Raw CSV Stream\n12.4,55.1,1024`}
          actionLabel="Try DSP Harmonics Demo"
          onAction={() => onSelectDemo('dsp_harmonics')}
        />
      ) : (
        <div
          className={cn(
            'grid gap-4',
            columns === 1 && 'grid-cols-1',
            columns === 2 && 'grid-cols-1 lg:grid-cols-2',
            columns === 3 && 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
          )}
        >
          {widgetList.map((widget) => {
            if (widget.type === 'chart') {
              const currentDisplayType = widgetPrefs[widget.id] || widget.displayType || 'line';
              return (
                <ChartWidget
                  key={widget.id}
                  label={widget.label}
                  value={widget.value as number}
                  unit={widget.unit}
                  history={widget.history}
                  displayType={currentDisplayType}
                  onChangeType={(type) => setWidgetPref(widget.id, type)}
                />
              );
            }
            return <TextWidget key={widget.id} label={widget.label} value={widget.value} />;
          })}
        </div>
      )}
    </div>
  );
};
