"""Dashboard schemas for metrics and analytics."""

from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel


class StatusDistribution(BaseModel):
  name: str
  count: int
  color: str


class TypeDistribution(BaseModel):
  name: str
  count: int
  color: str
  icon: Optional[str] = None


class RecentActivity(BaseModel):
  ticket_key: str
  title: str
  action: str
  user_name: str
  timestamp: str


class DueDateMetrics(BaseModel):
  dueSoon: int  # Due within 7 days
  dueToday: int
  pastDue: int


class DashboardMetrics(BaseModel):
  totalIssues: int
  completed: int
  inProgress: int
  overdue: int
  completionRate: float
  dueDateMetrics: DueDateMetrics
  statusDistribution: List[StatusDistribution]
  typeDistribution: List[TypeDistribution]
  recentActivity: List[RecentActivity]


class DashboardTicket(BaseModel):
  """Ticket row used in dashboard ticket lists."""
  id: int
  project_id: int
  key: str
  title: str
  assignee_name: Optional[str] = None
  assignee_email: Optional[str] = None
  priority: Optional[str] = None
  due_date: Optional[datetime] = None
