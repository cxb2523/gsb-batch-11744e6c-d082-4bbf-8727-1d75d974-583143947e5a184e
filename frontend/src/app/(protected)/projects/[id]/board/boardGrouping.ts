import { PRIORITY_OPTIONS, priorityColor } from '@/lib/priority';
import { WorkflowStatus, ProjectMember } from '../../../../../lib/api/settings';
import { EpicListItem } from '../../../../../lib/api/epics';
import { IssueCardData } from '../../../../../components/board/IssueCard';
import type { BoardGroupBy } from '../../../../../lib/api/board';

export interface GroupColumn {
  id: string;
  name: string;
  color: string;
}

// Dynamic grouping based on the groupBy selection.
export function getGroupColumns(
  groupBy: BoardGroupBy | 'none',
  statuses: WorkflowStatus[],
  members: ProjectMember[],
  epics: EpicListItem[],
): GroupColumn[] {
  if (groupBy === 'assignee') {
    const unassigned = { id: 'unassigned', name: 'Unassigned', color: '#8993A4' };
    const assigneeColumns = members.map((m) => ({
      id: m.user_id.toString(),
      name: m.name,
      color: '#0052CC',
    }));
    return [unassigned, ...assigneeColumns];
  } else if (groupBy === 'epic') {
    const noEpic = { id: 'no-epic', name: 'No Epic', color: '#8993A4' };
    const epicColumns = epics.map((e) => ({
      id: e.id.toString(),
      name: e.title,
      color: '#6554C0',
    }));
    return [noEpic, ...epicColumns];
  } else if (groupBy === 'priority') {
    return [
      ...PRIORITY_OPTIONS.map((o) => ({ id: o.value, name: o.label, color: priorityColor(o.value) })),
      { id: 'no-priority', name: 'No Priority', color: '#8993A4' },
    ];
  } else {
    // Default: group by status
    return statuses.map((s) => ({
      id: s.id.toString(),
      name: s.name,
      color: s.color || '#42526E',
    }));
  }
}

export function groupTickets(
  groupBy: BoardGroupBy | 'none',
  columns: GroupColumn[],
  filteredTickets: IssueCardData[],
): Record<string, IssueCardData[]> {
  const grouped: Record<string, IssueCardData[]> = {};

  columns.forEach((col) => {
    grouped[col.id] = [];
  });

  filteredTickets.forEach((ticket) => {
    let groupKey: string;

    if (groupBy === 'assignee') {
      groupKey = ticket.assignee?.id?.toString() || 'unassigned';
    } else if (groupBy === 'epic') {
      groupKey = ticket.epicId?.toString() || 'no-epic';
    } else if (groupBy === 'priority') {
      groupKey = ticket.priority || 'no-priority';
    } else {
      // Default: group by status
      groupKey = ticket.statusId?.toString() || '0';
    }

    if (grouped[groupKey]) {
      grouped[groupKey].push(ticket);
    }
  });

  return grouped;
}
