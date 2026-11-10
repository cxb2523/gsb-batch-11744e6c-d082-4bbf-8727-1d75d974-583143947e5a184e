import { WorkflowStatus } from './api/settings';

/**
 * Client-side mirror of the backend status-transition cap
 * (backend/app/routes/tickets.py :: validate_status_transition).
 *
 * The rule: a ticket may move any number of steps BACKWARD through the pipeline,
 * but at most ONE step forward. "Blocked" is a side-state that sits outside the
 * pipeline — entering it is always allowed and remembers the pre-block status;
 * when leaving it, the cap resumes from that remembered status.
 *
 * The backend stays authoritative; this only powers proactive UI (greying out
 * illegal options, tooltips) so the user isn't offered moves that will be rejected.
 */

/** Statuses that sit outside the linear pipeline and are exempt from the step math. */
export const isBlockedStatus = (name?: string | null): boolean =>
  (name || '').trim().toLowerCase() === 'blocked';

/** The pipeline in order, with out-of-flow statuses (Blocked) removed. */
export function getFlow(statuses: WorkflowStatus[]): WorkflowStatus[] {
  return [...statuses]
    .sort((a, b) => a.position - b.position)
    .filter((s) => !isBlockedStatus(s.name));
}

function flowIndexById(statuses: WorkflowStatus[]): Map<number, number> {
  const map = new Map<number, number>();
  getFlow(statuses).forEach((s, i) => map.set(s.id, i));
  return map;
}

function nameById(statuses: WorkflowStatus[], id?: number | null): string {
  const s = statuses.find((x) => x.id === id);
  return s ? s.name : '';
}

/**
 * Resolve the "from" flow index for a transition, accounting for the Blocked
 * resume rule. Returns undefined when there's no usable reference.
 */
function fromFlowIndex(
  statuses: WorkflowStatus[],
  fromId: number | null | undefined,
  preBlockId?: number | null,
): number | undefined {
  const flow = getFlow(statuses);
  const index = flowIndexById(statuses);
  if (isBlockedStatus(nameById(statuses, fromId))) {
    // Leaving Blocked: resume from the remembered status, else the first flow step.
    if (preBlockId != null && index.has(preBlockId)) return index.get(preBlockId);
    return flow.length ? 0 : undefined;
  }
  return fromId != null ? index.get(fromId) : undefined;
}

/**
 * True if moving from `fromId` to `toId` is allowed under the cap.
 * `preBlockId` is the ticket's pre-block status (only relevant when currently Blocked).
 */
export function canMoveTo(
  statuses: WorkflowStatus[],
  fromId: number | null | undefined,
  toId: number,
  preBlockId?: number | null,
): boolean {
  if (fromId === toId) return true;
  // Entering Blocked (or any out-of-flow status) is always allowed.
  if (isBlockedStatus(nameById(statuses, toId))) return true;

  const fiFrom = fromFlowIndex(statuses, fromId, preBlockId);
  const fiTo = flowIndexById(statuses).get(toId);
  // Unknown/custom target or no usable reference: don't false-block in the UI.
  if (fiTo === undefined || fiFrom === undefined) return true;
  return fiTo <= fiFrom + 1;
}

/** Name of the single legal next-forward status from `fromId` (for messaging). */
export function nextStatusName(
  statuses: WorkflowStatus[],
  fromId: number | null | undefined,
  preBlockId?: number | null,
): string | undefined {
  const fiFrom = fromFlowIndex(statuses, fromId, preBlockId);
  if (fiFrom === undefined) return undefined;
  return getFlow(statuses)[fiFrom + 1]?.name;
}

/** Short, friendly reason a transition is blocked, or null if it's allowed. */
export function transitionBlockReason(
  statuses: WorkflowStatus[],
  fromId: number | null | undefined,
  toId: number,
  preBlockId?: number | null,
): string | null {
  if (canMoveTo(statuses, fromId, toId, preBlockId)) return null;
  const next = nextStatusName(statuses, fromId, preBlockId);
  return next ? `Move to "${next}" first.` : 'You can only move one step forward.';
}
