"""
Skills and Employee Pool Models
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class Skill(BaseModel):
    """Skill model for tracking employee skills"""
    id: Optional[int] = None
    name: str = Field(..., description="Skill name (e.g., React, Python, DevOps)")
    category: str = Field(..., description="Skill category (e.g., Frontend, Backend, Design)")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserSkill(BaseModel):
    """User skill with proficiency level"""
    user_id: int
    skill_id: int
    skill_name: str
    proficiency: str = Field(..., description="beginner, intermediate, expert")
    years_experience: Optional[float] = None
    last_used: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserAvailability(BaseModel):
    """User availability and workload tracking"""
    user_id: int
    status: str = Field(default="available", description="available, busy, unavailable")
    current_workload: int = Field(default=0, description="Number of active tickets")
    capacity: int = Field(default=100, description="Max capacity percentage")
    available_hours_per_week: Optional[float] = None
    updated_at: Optional[datetime] = None


class EmployeeProfile(BaseModel):
    """Complete employee profile with skills and availability"""
    id: int
    name: str
    email: str
    role: str
    designation: Optional[str] = None  # e.g., "Senior Developer", "Junior Developer", "Tech Lead"
    department: Optional[str] = None
    title: Optional[str] = None  # Deprecated: use designation instead
    profile_photo: Optional[str] = None
    skills: List[UserSkill] = []
    availability: Optional[UserAvailability] = None
    total_tickets_completed: int = 0
    average_completion_time: Optional[float] = None
    performance_score: Optional[float] = None
    created_at: Optional[datetime] = None
    last_synced: Optional[datetime] = None


class RecommendationRequest(BaseModel):
    """Request for developer recommendations"""
    project_id: Optional[int] = None
    ticket_type: Optional[str] = None
    required_skills: List[str] = []
    priority: Optional[str] = None
    estimated_hours: Optional[float] = None
    preferred_designation: Optional[str] = None  # e.g., "Senior Developer" for complex tasks
    limit: int = Field(default=5, description="Number of recommendations to return")


class RecommendationResult(BaseModel):
    """Developer recommendation result"""
    user_id: int
    name: str
    email: str
    designation: Optional[str] = None
    match_score: float = Field(..., description="0-100 match score")
    matching_skills: List[str]
    proficiency_level: str
    current_workload: int
    availability_status: str
    reason: str = Field(..., description="Why this developer is recommended")
