import {
  Zap,
  BookOpen,
  CheckSquare,
  Bug,
  ListTree,
  Ban,
  Pause,
  Link2,
  Copy,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for issue-type and issue-link iconography.
 *
 * Previously each consumer (CreateIssueModal, IssueHierarchyBreadcrumb,
 * IssueLinkList) carried its own emoji map, which drifted apart and rendered
 * raw emoji instead of icons. These maps keep them in sync and on the Lucide
 * icon system used across the rest of the app.
 */

export type IssueTypeKey = 'epic' | 'story' | 'task' | 'bug' | 'subtask';

export const ISSUE_TYPE_ICON: Record<string, LucideIcon> = {
  epic: Zap,
  story: BookOpen,
  task: CheckSquare,
  bug: Bug,
  subtask: ListTree,
};

export const ISSUE_TYPE_LABEL: Record<string, string> = {
  epic: 'Epic',
  story: 'Story',
  task: 'Task',
  bug: 'Bug',
  subtask: 'Subtask',
};

export type LinkTypeKey =
  | 'blocks'
  | 'blocked_by'
  | 'relates_to'
  | 'duplicates'
  | 'duplicated_by';

export const LINK_TYPE_ICON: Record<string, LucideIcon> = {
  blocks: Ban,
  blocked_by: Pause,
  relates_to: Link2,
  duplicates: Copy,
  duplicated_by: Copy,
};
