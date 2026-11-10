export const getDueDateStatus = (dueDate?: string) => {
  if (!dueDate) return null;
  const now = new Date();
  const due = new Date(dueDate);
  const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0) {
    return { label: 'Overdue', color: '#DE350B', bg: '#FFEBE6' };
  } else if (daysUntilDue === 0) {
    return { label: 'Due Today', color: '#FF991F', bg: '#FFF7E6' };
  } else if (daysUntilDue <= 7) {
    return { label: `${daysUntilDue}d left`, color: '#FF991F', bg: '#FFF7E6' };
  }
  return null;
};
