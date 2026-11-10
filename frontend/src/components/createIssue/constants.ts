import { PRIORITY_OPTIONS, PRIORITY_COLOR } from '../../lib/priority';
import type { IssueType, Priority } from './types';

export const ISSUE_TYPES: IssueType[] = [
  { value: 'story', label: 'Story', description: 'User story or feature requirement' },
  { value: 'task', label: 'Task', description: 'A task that needs to be done' },
  { value: 'bug', label: 'Bug', description: 'A problem that needs to be fixed' },
  { value: 'epic', label: 'Epic', description: 'Large body of work with multiple stories' },
  { value: 'subtask', label: 'Subtask', description: 'Breakdown of a parent issue' },
];

export const DISCIPLINE_OPTIONS: { value: string; label: string }[] = [
  { value: 'design', label: 'Design' },
  { value: 'frontend', label: 'Frontend' },
  { value: 'backend', label: 'Backend' },
  { value: 'qa', label: 'QA' },
];

export const PRIORITIES: Priority[] = PRIORITY_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
  color: PRIORITY_COLOR[o.value],
}));

/** How many candidate parents a search returns. */
export const PARENT_RESULT_LIMIT = 20;

/** What can be a parent: everything except an epic, which holds issues instead. */
export const PARENT_TYPES = ['story', 'task', 'bug', 'campaign', 'design', 'engineering'];

// Max size for a single attachment (images / PDFs). Keep in sync with the
// "max 10MB per file" hint rendered in the upload area below.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
