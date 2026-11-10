"""Pydantic schemas for Reports endpoints."""

from datetime import date
from typing import Optional, List
from pydantic import BaseModel


# ========== Burndown Chart ==========

class BurndownDataPoint(BaseModel):
    """Single data point in burndown chart."""
    date: date
    story_points_remaining: int
    ideal_remaining: int
    scope_change: Optional[int] = 0


class BurndownChartResponse(BaseModel):
    """Response schema for burndown chart."""
    sprint_id: int
    sprint_name: str
    start_date: date
    end_date: date
    total_story_points: int
    data_points: List[BurndownDataPoint]


# ========== Velocity Chart ==========

class VelocityDataPoint(BaseModel):
    """Single sprint data point in velocity chart."""
    sprint_id: int
    sprint_name: str
    committed: int
    completed: int


class VelocityChartResponse(BaseModel):
    """Response schema for velocity chart."""
    sprints: List[VelocityDataPoint]
    average_velocity: float


# ========== Sprint Report ==========

class SprintReportIssue(BaseModel):
    """Issue summary in sprint report."""
    id: int
    key: str
    title: str
    type: str
    status_name: str
    story_points: Optional[int] = None
    assignee: Optional[dict] = None


class SprintReportResponse(BaseModel):
    """Response schema for sprint report."""
    sprint_id: int
    sprint_name: str
    start_date: date
    end_date: date
    completed_issues: List[SprintReportIssue]
    incomplete_issues: List[SprintReportIssue]
    added_issues: List[SprintReportIssue]
    removed_issues: List[SprintReportIssue]
    total_committed_points: int
    total_completed_points: int
    completion_percentage: float


