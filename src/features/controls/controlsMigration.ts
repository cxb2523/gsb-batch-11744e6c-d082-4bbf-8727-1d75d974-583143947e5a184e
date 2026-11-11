import type { ControlConfig, WorkspaceTab } from '../../lib/workspace';

const VALID_TABS = new Set<WorkspaceTab>(['telemetry', 'framebuffer', 'console', 'controls']);

export function migrateControlConfig(raw: Partial<ControlConfig>): ControlConfig | null {
  if (!raw || typeof raw !== 'object') return null;

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;

  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : id;

  const validTypes = ['button', 'slider', 'toggle', 'numeric'] as const;
  const type = validTypes.includes(raw.type as any) ? (raw.type as ControlConfig['type']) : 'button';

  const group = typeof raw.group === 'string' && raw.group.trim() ? raw.group.trim() : 'General';

  let pinTo: WorkspaceTab[] = [];
  if (Array.isArray(raw.pinTo)) {
    pinTo = raw.pinTo.filter((t): t is WorkspaceTab => VALID_TABS.has(t as WorkspaceTab));
  }
  if (pinTo.length === 0) {
    pinTo = ['controls'];
  }

  const result: ControlConfig = {
    id,
    label,
    type,
    group,
    pinTo,
  };

  if (type === 'slider') {
    result.min = typeof raw.min === 'number' && Number.isFinite(raw.min) ? raw.min : 0;
    result.max = typeof raw.max === 'number' && Number.isFinite(raw.max) ? raw.max : 100;
    result.step = typeof raw.step === 'number' && Number.isFinite(raw.step) && raw.step > 0 ? raw.step : 1;
  }

  if (type === 'toggle') {
    result.value = Boolean(raw.value);
  }

  if (type === 'numeric') {
    result.value = typeof raw.value === 'number' ? raw.value : 0;
    result.unit = typeof raw.unit === 'string' ? raw.unit : undefined;
  }

  return result;
}

export function migrateControls(rawList: unknown): ControlConfig[] {
  if (!Array.isArray(rawList)) return [];

  const seenIds = new Set<string>();
  const migrated: ControlConfig[] = [];

  for (const item of rawList) {
    const ctrl = migrateControlConfig(item);
    if (ctrl && !seenIds.has(ctrl.id)) {
      seenIds.add(ctrl.id);
      migrated.push(ctrl);
    }
  }

  return migrated;
}
