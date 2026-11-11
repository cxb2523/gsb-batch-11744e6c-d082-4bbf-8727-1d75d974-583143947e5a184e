import { create } from 'zustand';
import { RingBuffer } from './ringBuffer';
import { RateMeter } from './rateMeter';
import {
  type WorkspaceTab,
  type DemoPreset,
  type ChartType,
  type ControlConfig,
  DEFAULT_BUFFER_SIZE,
  loadWorkspaceFromStorage,
  saveWorkspaceToStorage,
} from '../lib/workspace';
import type { ConnectionStatus } from '../hooks/useWebSerial';
import type { WidgetConfig, SerialProtocol } from '../lib/parser';
import type { TerminalLogItem } from '../components/widgets/TerminalLog';

export type SourceMode = 'usb' | 'bridge' | 'demo';

export interface StudioState {
  // Navigation & Shell
  activeTab: WorkspaceTab;
  inspectorOpen: boolean;
  sourceMode: SourceMode;
  demoPreset: DemoPreset;
  baudRate: number;
  bufferSize: number;
  status: ConnectionStatus;
  error: string | null;
  bridgeStatus: any | null;
  activeProtocol: SerialProtocol | null;

  // Telemetry & Widgets
  widgets: Map<string, WidgetConfig>;
  widgetPrefs: Record<string, ChartType>;
  controls: ControlConfig[];

  // Streaming Data & Buffers
  logBuffer: RingBuffer<TerminalLogItem>;
  rateMeter: RateMeter;
  unreadLogsCount: number;
  hasNewPixels: boolean;
  lastRxLine: string;

  // Modals & UI State
  isCodeGenOpen: boolean;
  isSettingsOpen: boolean;

  // Actions
  setActiveTab: (tab: WorkspaceTab) => void;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  setSourceMode: (mode: SourceMode) => void;
  setDemoPreset: (preset: DemoPreset) => void;
  setBaudRate: (rate: number) => void;
  setBufferSize: (size: number) => void;
  setStatus: (status: ConnectionStatus) => void;
  setError: (err: string | null) => void;
  setBridgeStatus: (status: any) => void;
  setActiveProtocol: (proto: SerialProtocol | null) => void;
  setWidgets: (updater: (prev: Map<string, WidgetConfig>) => Map<string, WidgetConfig>) => void;
  setWidgetPref: (id: string, type: ChartType) => void;
  setControls: (controls: ControlConfig[]) => void;
  addControl: (ctrl: ControlConfig) => void;
  updateControl: (id: string, patch: Partial<ControlConfig>) => void;
  deleteControl: (id: string) => void;
  pushLog: (log: TerminalLogItem) => void;
  clearLogs: () => void;
  resetUnreadLogs: () => void;
  markNewPixels: (val: boolean) => void;
  openCodeGen: (open: boolean) => void;
  openSettings: (open: boolean) => void;
  saveWorkspace: () => void;
}

const initialProfile = loadWorkspaceFromStorage();

export const useStudioStore = create<StudioState>((set, get) => ({
  activeTab: initialProfile?.activeTab ?? 'telemetry',
  inspectorOpen: initialProfile?.inspectorOpen ?? true,
  sourceMode: 'usb',
  demoPreset: initialProfile?.demoPreset ?? 'dsp_harmonics',
  baudRate: initialProfile?.baudRate ?? 115200,
  bufferSize: initialProfile?.bufferSize ?? DEFAULT_BUFFER_SIZE,
  status: 'disconnected',
  error: null,
  bridgeStatus: null,
  activeProtocol: null,

  widgets: new Map<string, WidgetConfig>(),
  widgetPrefs: initialProfile?.widgetPrefs ?? {},
  controls: initialProfile?.controls ?? [],

  logBuffer: new RingBuffer<TerminalLogItem>(10000),
  rateMeter: new RateMeter(1000),
  unreadLogsCount: 0,
  hasNewPixels: false,
  lastRxLine: '',

  isCodeGenOpen: false,
  isSettingsOpen: false,

  setActiveTab: (tab) => {
    set({ activeTab: tab });
    if (tab === 'console') {
      set({ unreadLogsCount: 0 });
    }
    if (tab === 'framebuffer') {
      set({ hasNewPixels: false });
    }
    get().saveWorkspace();
  },

  toggleInspector: () => {
    set((s) => ({ inspectorOpen: !s.inspectorOpen }));
    get().saveWorkspace();
  },

  setInspectorOpen: (open) => {
    set({ inspectorOpen: open });
    get().saveWorkspace();
  },

  setSourceMode: (mode) => set({ sourceMode: mode }),

  setDemoPreset: (preset) => {
    set({ demoPreset: preset });
    get().saveWorkspace();
  },

  setBaudRate: (rate) => {
    set({ baudRate: rate });
    get().saveWorkspace();
  },

  setBufferSize: (size) => {
    set({ bufferSize: size });
    get().saveWorkspace();
  },

  setStatus: (status) => set({ status }),

  setError: (error) => set({ error }),

  setBridgeStatus: (bridgeStatus) => set({ bridgeStatus }),

  setActiveProtocol: (activeProtocol) => set({ activeProtocol }),

  setWidgets: (updater) => {
    set((s) => ({ widgets: updater(s.widgets) }));
  },

  setWidgetPref: (id, type) => {
    set((s) => ({ widgetPrefs: { ...s.widgetPrefs, [id]: type } }));
    get().saveWorkspace();
  },

  setControls: (controls) => {
    set({ controls });
    get().saveWorkspace();
  },

  addControl: (ctrl) => {
    set((s) => ({ controls: [...s.controls, ctrl] }));
    get().saveWorkspace();
  },

  updateControl: (id, patch) => {
    set((s) => ({
      controls: s.controls.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
    get().saveWorkspace();
  },

  deleteControl: (id) => {
    set((s) => ({ controls: s.controls.filter((c) => c.id !== id) }));
    get().saveWorkspace();
  },

  pushLog: (log) => {
    const { logBuffer, rateMeter, activeTab } = get();
    logBuffer.push(log);
    const byteLen = log.rawBytes?.length ?? (log.text.length + 1);
    rateMeter.record(1, byteLen);

    const isBackground = activeTab !== 'console';
    set((s) => ({
      unreadLogsCount: isBackground && !log.isTx ? s.unreadLogsCount + 1 : s.unreadLogsCount,
      lastRxLine: !log.isTx ? log.text : s.lastRxLine,
    }));
  },

  clearLogs: () => {
    get().logBuffer.clear();
    set({ unreadLogsCount: 0, lastRxLine: '' });
  },

  resetUnreadLogs: () => set({ unreadLogsCount: 0 }),

  markNewPixels: (val) => set({ hasNewPixels: val }),

  openCodeGen: (isCodeGenOpen) => set({ isCodeGenOpen }),

  openSettings: (isSettingsOpen) => set({ isSettingsOpen }),

  saveWorkspace: () => {
    const s = get();
    saveWorkspaceToStorage({
      baudRate: s.baudRate,
      bufferSize: s.bufferSize,
      controls: s.controls,
      widgetPrefs: s.widgetPrefs,
      demoPreset: s.demoPreset,
      activeTab: s.activeTab,
      inspectorOpen: s.inspectorOpen,
    });
  },
}));
