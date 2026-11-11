export type ChartType = 'line' | 'bar' | 'gauge' | 'fft';
export type DemoPreset = 'dsp_harmonics' | 'pid_motor' | 'iot_env' | 'raymarcher_gpu';
export type WorkspaceTab = 'telemetry' | 'framebuffer' | 'console' | 'controls';

export interface ControlConfig {
  id: string;
  type: 'button' | 'slider' | 'toggle' | 'numeric';
  label: string;
  group?: string;
  pinTo?: WorkspaceTab[];
  min?: number;
  max?: number;
  step?: number;
  value?: number | boolean | string;
  unit?: string;
}

export const VALID_BUFFER_SIZES = [64, 128, 256, 512, 1024] as const;
export type ValidBufferSize = (typeof VALID_BUFFER_SIZES)[number];
export const DEFAULT_BUFFER_SIZE: ValidBufferSize = 128;

export interface WorkspaceProfile {
  version: '2.2' | '3.2';
  name: string;
  exportedAt: string;
  baudRate: number;
  bufferSize?: number;
  controls: ControlConfig[];
  widgetPrefs: Record<string, ChartType>;
  demoPreset?: DemoPreset;
  activeTab?: WorkspaceTab;
  inspectorOpen?: boolean;
}

export const WORKSPACE_STORAGE_KEY = 'openserial_studio_workspace_v2';

const VALID_CHART_TYPES = new Set<ChartType>(['line', 'bar', 'gauge', 'fft']);
const VALID_TABS = new Set<WorkspaceTab>(['telemetry', 'framebuffer', 'console', 'controls']);

export function serializeWorkspaceProfile(
  state: {
    baudRate: number;
    bufferSize?: number;
    controls: ControlConfig[];
    widgetPrefs: Record<string, ChartType>;
    demoPreset?: DemoPreset;
    activeTab?: WorkspaceTab;
    inspectorOpen?: boolean;
  },
  name = 'OpenSerial Studio Profile'
): string {
  const profile: WorkspaceProfile = {
    version: '3.2',
    name,
    exportedAt: new Date().toISOString(),
    baudRate: state.baudRate,
    bufferSize: state.bufferSize ?? DEFAULT_BUFFER_SIZE,
    controls: state.controls,
    widgetPrefs: state.widgetPrefs,
    demoPreset: state.demoPreset,
    activeTab: state.activeTab,
    inspectorOpen: state.inspectorOpen,
  };
  return JSON.stringify(profile, null, 2);
}

export function parseWorkspaceProfile(rawJson: string): WorkspaceProfile | null {
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const obj = parsed as Record<string, unknown>;
    const baudRate =
      typeof obj.baudRate === 'number' && Number.isFinite(obj.baudRate) && obj.baudRate > 0
        ? Math.floor(obj.baudRate)
        : 115200;

    const bufferSize =
      typeof obj.bufferSize === 'number' &&
      VALID_BUFFER_SIZES.includes(obj.bufferSize as ValidBufferSize)
        ? (obj.bufferSize as ValidBufferSize)
        : DEFAULT_BUFFER_SIZE;

    const controls: ControlConfig[] = [];
    if (Array.isArray(obj.controls)) {
      const seenIds = new Set<string>();
      for (const item of obj.controls) {
        if (!item || typeof item !== 'object') continue;
        const c = item as Record<string, unknown>;
        const id = typeof c.id === 'string' ? c.id.trim() : '';
        const rawType = c.type;
        const type: ControlConfig['type'] | null =
          rawType === 'button' || rawType === 'slider' || rawType === 'toggle' || rawType === 'numeric'
            ? rawType
            : null;
        if (!id || !type || seenIds.has(id)) continue;
        seenIds.add(id);

        const group = typeof c.group === 'string' && c.group.trim() ? c.group.trim() : 'General';
        const pinTo: WorkspaceTab[] = [];
        if (Array.isArray(c.pinTo)) {
          for (const tab of c.pinTo) {
            if (typeof tab === 'string' && VALID_TABS.has(tab as WorkspaceTab)) {
              pinTo.push(tab as WorkspaceTab);
            }
          }
        }

        controls.push({
          id,
          type,
          label: typeof c.label === 'string' && c.label.trim() ? c.label.trim() : id,
          group,
          pinTo: pinTo.length > 0 ? pinTo : undefined,
          min: typeof c.min === 'number' && Number.isFinite(c.min) ? c.min : undefined,
          max: typeof c.max === 'number' && Number.isFinite(c.max) ? c.max : undefined,
          step: typeof c.step === 'number' && Number.isFinite(c.step) && c.step > 0 ? c.step : undefined,
          value: c.value as any,
          unit: typeof c.unit === 'string' ? c.unit : undefined,
        });
      }
    }

    const widgetPrefs: Record<string, ChartType> = {};
    if (obj.widgetPrefs && typeof obj.widgetPrefs === 'object' && !Array.isArray(obj.widgetPrefs)) {
      for (const [k, v] of Object.entries(obj.widgetPrefs as Record<string, unknown>)) {
        if (typeof v === 'string' && VALID_CHART_TYPES.has(v as ChartType)) {
          widgetPrefs[k] = v as ChartType;
        }
      }
    }

    const demoPreset =
      obj.demoPreset === 'dsp_harmonics' ||
      obj.demoPreset === 'pid_motor' ||
      obj.demoPreset === 'iot_env' ||
      obj.demoPreset === 'raymarcher_gpu'
        ? obj.demoPreset
        : undefined;

    const activeTab = typeof obj.activeTab === 'string' && VALID_TABS.has(obj.activeTab as WorkspaceTab)
      ? (obj.activeTab as WorkspaceTab)
      : undefined;

    const inspectorOpen = typeof obj.inspectorOpen === 'boolean' ? obj.inspectorOpen : undefined;

    return {
      version: '3.2',
      name: typeof obj.name === 'string' ? obj.name : 'Imported Profile',
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      baudRate,
      bufferSize,
      controls,
      widgetPrefs,
      demoPreset,
      activeTab,
      inspectorOpen,
    };
  } catch {
    return null;
  }
}

export function loadWorkspaceFromStorage(): WorkspaceProfile | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    return parseWorkspaceProfile(raw);
  } catch {
    return null;
  }
}

export function saveWorkspaceToStorage(state: {
  baudRate: number;
  bufferSize?: number;
  controls: ControlConfig[];
  widgetPrefs: Record<string, ChartType>;
  demoPreset?: DemoPreset;
  activeTab?: WorkspaceTab;
  inspectorOpen?: boolean;
}): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(WORKSPACE_STORAGE_KEY, serializeWorkspaceProfile(state));
  } catch {
    // Ignore storage quota errors
  }
}
