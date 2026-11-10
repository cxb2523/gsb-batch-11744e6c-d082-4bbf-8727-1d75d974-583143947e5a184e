from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserOut(BaseModel):
  id: int
  email: str
  name: str
  role: str
  department: Optional[str] = None
  designation: Optional[str] = None
  profile_photo: Optional[str] = None
  last_login_at: Optional[datetime] = None
  created_at: Optional[datetime] = None
  # True for admin-created accounts until the user sets their own password (forced reset).
  must_change_password: bool = False

  class Config:
    from_attributes = True


class UserSelfUpdate(BaseModel):
  name: Optional[str] = None
  department: Optional[str] = None
  designation: Optional[str] = None
  profile_photo: Optional[str] = None


class DevLoginIn(BaseModel):
  email: str = Field(..., min_length=3, max_length=254)
  password: str = Field(..., min_length=1, max_length=200)


class LoginIn(BaseModel):
  email: str = Field(..., min_length=3, max_length=254)
  password: str = Field(..., min_length=1, max_length=200)
  remember_me: bool = False


class ChangePasswordIn(BaseModel):
  current_password: str = Field(..., min_length=1, max_length=200)
  new_password: str = Field(..., min_length=8, max_length=200)
