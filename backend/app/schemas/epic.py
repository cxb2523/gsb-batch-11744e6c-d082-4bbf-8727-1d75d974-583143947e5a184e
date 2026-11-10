from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List


class EpicBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    color: str = Field(default="#155dfc", pattern=r'^#[0-9A-Fa-f]{6}$')
    status: str = Field(default="planned")


class EpicCreate(EpicBase):
    pass


class EpicUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None
    start_date: Optional[datetime] = None
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    status: Optional[str] = None
    position: Optional[int] = None


class UserInfo(BaseModel):
    id: int
    name: str
    email: str
    initials: str


class EpicResponse(EpicBase):
    id: int
    project_id: int
    key: str
    position: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: int
    assignee: Optional[UserInfo] = None

    class Config:
        from_attributes = True


class EpicWithStats(EpicResponse):
    """Epic with ticket statistics"""
    total_tickets: int = 0
    completed_tickets: int = 0
    in_progress_tickets: int = 0
    todo_tickets: int = 0
    progress_percentage: float = 0.0


class EpicListItem(BaseModel):
    """Lightweight epic list item"""
    id: int
    key: str
    title: str
    status: str
    color: str
    assignee_id: Optional[int] = None
    assignee: Optional[UserInfo] = None
    due_date: Optional[datetime] = None
    total_tickets: int = 0
    completed_tickets: int = 0
    progress_percentage: float = 0.0

    class Config:
        from_attributes = True


class EpicPage(BaseModel):
    """One page of epics. See TicketPage: same contract, same opaque cursor."""
    items: List[EpicListItem]
    next_cursor: Optional[str] = None
    total: int


class TicketEpicInfo(BaseModel):
    """Minimal epic info for ticket responses"""
    id: int
    key: str
    title: str
    color: str

    class Config:
        from_attributes = True
