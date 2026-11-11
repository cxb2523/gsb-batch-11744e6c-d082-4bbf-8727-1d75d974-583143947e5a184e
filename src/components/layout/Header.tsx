import React from 'react';
import {
  Plug,
  Settings,
  Activity,
  Code2,
  Download,
  Play,
  Square,
  Radio,
  Unlock,
  Lock,
  ChevronDown,
} from 'lucide-react';
import type { ConnectionStatus, TransportMode } from '../../hooks/useWebSerial';
import { useStudioStore, type SourceMode } from '../../store/useStudioStore';
import type { DemoPreset } from '../../lib/workspace';
import { cn } from '../../lib/utils';

interface HeaderProps {
  status: ConnectionStatus;
  transportMode: TransportMode;
  onSelectTransportMode: (mode: TransportMode) => void;
  bridgeStatus?: any;
  onSelectBridgePort?: (port: string) => void;
  onReleaseBridgePort?: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenCodeGen: () => void;
  onOpenSettings: () => void;
  onDemo?: () => void;
  isDemoMode?: boolean;
  onSelectDemoPreset?: (preset: DemoPreset) => void;
  isRecording?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onExportCSV?: () => void;
  logCount?: number;
}

const DEMO_PRESET_OPTIONS: { id: DemoPreset; label: string; tab: 'telemetry' | 'framebuffer' }[] = [
  { id: 'dsp_harmonics', label: 'DSP Harmonics (FFT)', tab: 'telemetry' },
  { id: 'pid_motor', label: 'PID Motor Step', tab: 'telemetry' },
  { id: 'iot_env', label: 'IoT Environment', tab: 'telemetry' },
  { id: 'raymarcher_gpu', label: '3D GPU Raymarcher', tab: 'framebuffer' },
];

export const Header: React.FC<HeaderProps> = ({
  status,
  transportMode,
  onSelectTransportMode,
  bridgeStatus,
  onSelectBridgePort,
  onReleaseBridgePort,
  onConnect,
  onDisconnect,
  onOpenCodeGen,
  onOpenSettings,
  onDemo,
  isDemoMode,
  onSelectDemoPreset,
  isRecording,
  onStartRecording,
  onStopRecording,
  onExportCSV,
  logCount,
}) => {
  const sourceMode = useStudioStore((s) => s.sourceMode);
  const setSourceMode = useStudioStore((s) => s.setSourceMode);
  const demoPreset = useStudioStore((s) => s.demoPreset);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);

  const handleSourceChange = (mode: SourceMode) => {
    setSourceMode(mode);
    if (mode === 'demo') {
      if (!isDemoMode && onDemo) {
        onDemo();
      }
    } else {
      if (isDemoMode && onDemo) {
        onDemo(); // Stop demo
      }
      onSelectTransportMode(mode === 'bridge' ? 'bridge' : 'usb');
    }
  };

  const handlePresetSelect = (preset: DemoPreset) => {
    const option = DEMO_PRESET_OPTIONS.find((p) => p.id === preset);
    if (option) {
      setActiveTab(option.tab);
    }
    onSelectDemoPreset?.(preset);
  };

  return (
    <header className="h-14 border-b border-white/[0.08] bg-[#09090b] px-4 flex items-center justify-between select-none z-30">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/10 flex items-center justify-center">
          <Activity className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-semibold text-sm text-zinc-100 tracking-tight">OpenSerial</span>
          <span className="text-xs text-zinc-500 font-mono">Studio</span>
          <span className="text-[10px] font-mono text-zinc-600 ml-1">v3.2</span>
        </div>
      </div>

      {/* Middle: Unified Source Selector [USB | Bridge | Demo] & Context Menu */}
      <div className="flex items-center gap-2">
        <div className="flex items-center bg-[#111113] border border-white/[0.08] rounded-lg p-0.5 text-xs">
          <button
            type="button"
            onClick={() => handleSourceChange('usb')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors',
              sourceMode === 'usb' && !isDemoMode
                ? 'bg-zinc-800 text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
            title="Direct Browser Web Serial (Chrome/Edge)"
          >
            <Plug className="w-3.5 h-3.5 text-cyan-400" />
            <span>USB</span>
          </button>

          <button
            type="button"
            onClick={() => handleSourceChange('bridge')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors',
              sourceMode === 'bridge' && !isDemoMode
                ? 'bg-zinc-800 text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
            title="Local WebSocket Bridge Daemon + MCP AI Agent (ws://127.0.0.1:8765)"
          >
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>Bridge</span>
          </button>

          <button
            type="button"
            onClick={() => handleSourceChange('demo')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors',
              sourceMode === 'demo' || isDemoMode
                ? 'bg-zinc-800 text-zinc-100 font-medium'
                : 'text-zinc-400 hover:text-zinc-200'
            )}
            title="Synthetic Hardware Simulation Presets"
          >
            <Play className="w-3.5 h-3.5 text-cyan-400" />
            <span>Demo</span>
          </button>
        </div>

        {/* Demo Preset Dropdown */}
        {(sourceMode === 'demo' || isDemoMode) && (
          <div className="relative flex items-center">
            <select
              value={demoPreset}
              onChange={(e) => handlePresetSelect(e.target.value as DemoPreset)}
              className="appearance-none bg-[#111113] border border-white/[0.08] hover:border-white/20 text-zinc-200 text-xs rounded-lg pl-2.5 pr-7 py-1.5 font-mono focus:outline-none focus:border-cyan-400"
            >
              {DEMO_PRESET_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 pointer-events-none" />
          </div>
        )}

        {/* Bridge Port Dropdown & Flash Release */}
        {sourceMode === 'bridge' && (status === 'connected' || status === 'released_for_flash') && (
          <div className="flex items-center gap-1.5 bg-[#111113] border border-white/[0.08] rounded-lg p-0.5">
            <select
              value={bridgeStatus?.activePort || 'sim://dsp_harmonics'}
              onChange={(e) => onSelectBridgePort?.(e.target.value)}
              className="bg-transparent text-zinc-200 text-xs px-2 py-1 font-mono focus:outline-none"
            >
              {(bridgeStatus?.availablePorts?.length
                ? bridgeStatus.availablePorts
                : [
                    { path: 'sim://dsp_harmonics' },
                    { path: 'sim://pid_motor' },
                    { path: 'sim://iot_env' },
                    { path: 'sim://raymarcher_gpu' },
                  ]
              ).map((p: any) => (
                <option key={p.path} value={p.path} className="bg-zinc-900">
                  {p.path}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                if (status === 'released_for_flash') {
                  onSelectBridgePort?.(bridgeStatus?.activePort || 'sim://dsp_harmonics');
                } else {
                  onReleaseBridgePort?.();
                }
              }}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                status === 'released_for_flash'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
              title={
                status === 'released_for_flash'
                  ? 'Resume Port'
                  : 'Release port lock for PlatformIO / esptool / STM32'
              }
            >
              {status === 'released_for_flash' ? (
                <>
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3 text-zinc-400" />
                  <span>Flash Unlock</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Right Controls: Status Pill, Connect/Disconnect, REC/CSV, CodeGen, Settings */}
      <div className="flex items-center gap-3">
        {/* Connection Status Pill */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#111113] border border-white/[0.08]">
          <span
            className={cn(
              'w-2 h-2 rounded-full transition-colors',
              status === 'connected' || isDemoMode
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
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            {status === 'connected'
              ? transportMode === 'bridge'
                ? 'Bridge'
                : 'Connected'
              : isDemoMode
              ? 'Demo'
              : status === 'connecting'
              ? 'Connecting'
              : status === 'released_for_flash'
              ? 'Flashing'
              : status === 'error'
              ? 'Error'
              : 'Idle'}
          </span>
        </div>

        {/* Connect / Disconnect Action */}
        {status !== 'connected' && status !== 'released_for_flash' && !isDemoMode ? (
          <button
            type="button"
            onClick={sourceMode === 'demo' ? onDemo : onConnect}
            disabled={status === 'connecting'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg font-semibold text-xs transition-colors disabled:opacity-50"
          >
            {sourceMode === 'demo' ? (
              <Play className="w-3.5 h-3.5 fill-current" />
            ) : sourceMode === 'bridge' ? (
              <Radio className="w-3.5 h-3.5" />
            ) : (
              <Plug className="w-3.5 h-3.5" />
            )}
            <span>
              {sourceMode === 'demo'
                ? 'Start Demo'
                : sourceMode === 'bridge'
                ? 'Connect Bridge'
                : 'Connect'}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={isDemoMode ? onDemo : onDisconnect}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg font-semibold text-xs transition-colors"
          >
            <span>{isDemoMode ? 'Stop Demo' : 'Disconnect'}</span>
          </button>
        )}

        {/* Recording Controls */}
        <div className="flex items-center bg-[#111113] border border-white/[0.08] rounded-lg p-0.5">
          {!isRecording ? (
            <button
              type="button"
              onClick={onStartRecording}
              title="Start recording telemetry"
              className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
            >
              <Play className="w-3 h-3 text-emerald-400" />
              <span>REC</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStopRecording}
              title="Stop recording"
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 transition-colors animate-pulse"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>STOP ({logCount})</span>
            </button>
          )}

          <div className="w-px h-3.5 bg-white/10" />

          <button
            type="button"
            onClick={onExportCSV}
            disabled={!logCount}
            title="Export CSV"
            className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-40 transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>CSV</span>
          </button>
        </div>

        <div className="w-px h-4 bg-white/10" />

        {/* Code Generator & Settings */}
        <button
          type="button"
          onClick={onOpenCodeGen}
          className="p-1.5 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-900 rounded-lg transition-colors"
          title="Firmware Code Generator (C++, STM32, MicroPython)"
        >
          <Code2 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg transition-colors"
          title="Settings & Workspace Profile"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
