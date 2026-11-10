// Sprint status colors
export const COLORS = {
  primary: '#0052CC',
  background: '#F4F5F7',
  cardBg: '#FFFFFF',
  textPrimary: '#172B4D',
  textSecondary: '#5E6C84',
  textTertiary: '#8993A4',
  success: '#00875A',
  warning: '#FF991F',
  error: '#DE350B',
  border: '#DFE1E6',
  borderLight: '#EBECF0',
};

// Issue types offered in the sprint toolbar's Type filter (the sprint board carries a
// wider set than the main board - subtasks and the campaign/design/engineering types).
export const SPRINT_TYPE_OPTIONS = [
  { id: 'task', name: 'Task' },
  { id: 'bug', name: 'Bug' },
  { id: 'story', name: 'Story' },
  { id: 'epic', name: 'Epic' },
  { id: 'subtask', name: 'Subtask' },
  { id: 'campaign', name: 'Campaign' },
  { id: 'design', name: 'Design' },
  { id: 'engineering', name: 'Engineering' },
];
