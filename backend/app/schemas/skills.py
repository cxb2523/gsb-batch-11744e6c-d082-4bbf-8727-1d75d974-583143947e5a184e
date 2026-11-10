"""
Skills Management Schemas
"""
from typing import Optional, List
from pydantic import BaseModel, Field


class SkillCreate(BaseModel):
    """Schema for creating a new skill"""
    name: str = Field(..., min_length=1, max_length=100)
    category: str = Field(..., description="Frontend, Backend, Design, DevOps, QA, etc.")


class SkillUpdate(BaseModel):
    """Schema for updating a skill"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    category: Optional[str] = None


class UserSkillCreate(BaseModel):
    """Schema for adding a skill to a user"""
    user_id: int
    skill_id: int
    proficiency: str = Field(..., description="beginner, intermediate, expert")
    years_experience: Optional[float] = Field(None, ge=0)
    last_used: Optional[str] = None  # ISO date string


class UserSkillUpdate(BaseModel):
    """Schema for updating a user's skill"""
    proficiency: Optional[str] = Field(None, description="beginner, intermediate, expert")
    years_experience: Optional[float] = Field(None, ge=0)
    last_used: Optional[str] = None


class UserAvailabilityUpdate(BaseModel):
    """Schema for updating user availability"""
    status: Optional[str] = Field(None, description="available, busy, unavailable")
    capacity: Optional[int] = Field(None, ge=0, le=100)
    available_hours_per_week: Optional[float] = Field(None, ge=0)


class GoogleWorkspaceUser(BaseModel):
    """Schema for Google Workspace user data"""
    id: str = Field(..., description="Google user ID")
    primaryEmail: str
    name: dict = Field(..., description="Contains fullName, givenName, familyName")
    orgUnitPath: Optional[str] = None
    isAdmin: bool = False
    suspended: bool = False
    thumbnailPhotoUrl: Optional[str] = None


class SyncUsersRequest(BaseModel):
    """Request to sync users from Google Workspace"""
    force_full_sync: bool = Field(default=False, description="Force sync all users")


class BulkSkillAssignment(BaseModel):
    """Assign multiple skills to a user at once"""
    user_id: int
    skills: List[dict] = Field(..., description="List of {skill_id, proficiency, years_experience}")


class UserProfileUpdate(BaseModel):
    """Schema for updating user profile information"""
    designation: Optional[str] = Field(None, description="Job title/designation like 'Senior Developer', 'Tech Lead'")
    department: Optional[str] = Field(None, description="Department like 'Engineering', 'Design', 'QA'")
