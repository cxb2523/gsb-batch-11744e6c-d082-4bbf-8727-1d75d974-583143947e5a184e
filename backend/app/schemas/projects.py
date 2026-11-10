from datetime import datetime
from typing import Optional, Union

from pydantic import BaseModel, Field


class ProjectMemberSpec(BaseModel):
  """A member to add at project creation, with the project role to grant."""
  user_id: int
  role: str = Field("member", pattern="^(admin|member|viewer)$")


class ProjectBase(BaseModel):
  key: str
  name: str
  description: Optional[str] = None
  deadline: Optional[datetime] = None


class ProjectCreate(ProjectBase):
  visibility: str = "private"
  # Members to add at creation. Each entry is either a bare user id (added as a
  # plain "member") or a {user_id, role} object. Global admins are skipped
  # server-side since they already have access to every project.
  members: Optional[list[Union[int, ProjectMemberSpec]]] = None


class OwnerInfo(BaseModel):
  id: int
  name: str
  email: str

  class Config:
    from_attributes = True


class ProjectOut(ProjectBase):
  id: int
  visibility: str
  created_at: datetime
  owner: OwnerInfo
  member_count: int = 0
  status: str = "active"  # active, in_progress, done, archived
  ticket_count: int = 0   # total tickets in the project
  overdue_count: int = 0  # tickets past their due date and not yet done
  epic_count: int = 0     # total epics in the project
  epic_overdue_count: int = 0  # epics past their due date and not yet done
  # Latest ticket activity in the project (newest updated_at/created_at across its
  # tickets), falling back to the project's own timestamps when it has none.
  last_activity_at: Optional[datetime] = None
  # The requesting user's role on this project: "admin", "member" or "viewer".
  # Mirrors require_project_admin exactly (global admin, or a project member whose
  # role is "admin"), so the UI gates on the same rule the API enforces instead of
  # falling back to the install-wide role. Costs no extra query: the membership rows
  # it comes from are already fetched to decide which projects are visible.
  my_role: str = "member"

  class Config:
    from_attributes = True


class TicketBase(BaseModel):
  title: str
  description: Optional[str] = None
  type: str
  status_id: int
  assignee_id: Optional[int] = None
  due_date: Optional[datetime] = None


class TicketCreate(TicketBase):
  project_id: int


class TicketOut(TicketBase):
  id: int
  project_id: int
  key: str

  class Config:
    from_attributes = True


