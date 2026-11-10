export const getDaysRemaining = (endDate?: string): number | null => {
  if (!endDate) return null;
  const end = new Date(endDate);
  const now = new Date();
  const diffTime = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

export const formatDaysRemaining = (days: number | null): string => {
  if (days === null) return '';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
};
