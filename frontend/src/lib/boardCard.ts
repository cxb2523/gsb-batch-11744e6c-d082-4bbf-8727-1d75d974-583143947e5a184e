import type { Ticket } from './api/tickets';
import type { IssueCardData } from '../components/board/IssueCard';

/**
 * Single source of truth for turning an API ticket into the card shape the shared
 * board components (BoardColumn / IssueCard) render. Both the board and sprint
 * pages use this so their cards carry identical fields — including the ones the
 * move rules depend on (preBlockStatusId for the one-step cap, mergeRequestUrl for
 * the evidence gate).
 */
export function toIssueCardData(ticket: Ticket): IssueCardData {
  return {
    id: ticket.id,
    key: ticket.key,
    title: ticket.title,
    type: (ticket.type as 'task' | 'bug' | 'story' | 'epic') || 'task',
    statusId: ticket.status_id,
    priority: ticket.priority,
    assignee: ticket.assignee
      ? {
          id: ticket.assignee.id,
          name: ticket.assignee.name,
          initials: ticket.assignee.initials,
        }
      : undefined,
    epicId: ticket.epic_id,
    labels: (ticket.labels || []).map((label, idx) => ({
      id: idx,
      name: label,
      color: '#DFE1E6',
    })),
    storyPoints: ticket.story_points,
    archived: ticket.archived,
    reporterEmail: ticket.reporter?.email,
    subtasksCompleted: ticket.subtasks_completed ?? undefined,
    subtasksTotal: ticket.subtasks_count ?? undefined,
    dueDate: ticket.due_date,
    mergeRequestUrl: ticket.merge_request_url,
    preBlockStatusId: ticket.pre_block_status_id,
  };
}
