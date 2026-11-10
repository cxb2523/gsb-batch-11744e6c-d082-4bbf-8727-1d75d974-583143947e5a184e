"""
Skills Management and Employee Pool API Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Annotated, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime

from ..db.mongo import get_mongo_db
from ..core.security import get_current_user, CurrentUser
from ..schemas.skills import (
    SkillCreate,
    SkillUpdate,
    UserSkillCreate,
    UserSkillUpdate,
    UserAvailabilityUpdate,
    BulkSkillAssignment,
    UserProfileUpdate,
)
from ..models.skills import (
    Skill,
    UserSkill,
    UserAvailability,
    EmployeeProfile,
    RecommendationRequest,
    RecommendationResult,
)

router = APIRouter(prefix="/skills", tags=["Skills Management"])


# ============== Skills CRUD ==============

@router.get("", response_model=List[Skill])
async def get_all_skills(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    category: Optional[str] = None,
):
    """Get all skills, optionally filtered by category"""
    skills_collection = db.skills

    query = {}
    if category:
        query["category"] = category

    skills = []
    async for skill_doc in skills_collection.find(query).sort("name", 1):
        skills.append(Skill(
            id=skill_doc.get("skill_number"),
            name=skill_doc.get("name"),
            category=skill_doc.get("category"),
            created_at=skill_doc.get("created_at"),
            updated_at=skill_doc.get("updated_at"),
        ))

    return skills


@router.post("", response_model=Skill, status_code=status.HTTP_201_CREATED)
async def create_skill(
    skill_data: SkillCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Create a new skill (Admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create skills")

    skills_collection = db.skills
    counters_collection = db.counters

    # Check if skill already exists
    existing = await skills_collection.find_one({"name": skill_data.name})
    if existing:
        raise HTTPException(status_code=400, detail="Skill already exists")

    # Get next skill number
    counter = await counters_collection.find_one_and_update(
        {"_id": "skill_id"},
        {"$inc": {"sequence_value": 1}},
        upsert=True,
        return_document=True
    )
    skill_number = counter.get("sequence_value", 1) if counter else 1

    # Create skill
    skill = {
        "skill_number": skill_number,
        "name": skill_data.name,
        "category": skill_data.category,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }

    await skills_collection.insert_one(skill)

    return Skill(
        id=skill_number,
        name=skill["name"],
        category=skill["category"],
        created_at=skill["created_at"],
        updated_at=skill["updated_at"],
    )


@router.put("/{skill_id}", response_model=Skill)
async def update_skill(
    skill_id: int,
    skill_data: SkillUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Update a skill (Admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update skills")

    skills_collection = db.skills

    # Find skill
    skill_doc = await skills_collection.find_one({"skill_number": skill_id})
    if not skill_doc:
        raise HTTPException(status_code=404, detail="Skill not found")

    # Build update data
    update_data = {"updated_at": datetime.now()}
    if skill_data.name is not None:
        update_data["name"] = skill_data.name
    if skill_data.category is not None:
        update_data["category"] = skill_data.category

    # Update skill
    await skills_collection.update_one(
        {"skill_number": skill_id},
        {"$set": update_data}
    )

    # Fetch updated skill
    updated_skill = await skills_collection.find_one({"skill_number": skill_id})

    return Skill(
        id=updated_skill["skill_number"],
        name=updated_skill["name"],
        category=updated_skill["category"],
        created_at=updated_skill.get("created_at"),
        updated_at=updated_skill.get("updated_at"),
    )


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(
    skill_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Delete a skill (Admin only)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete skills")

    skills_collection = db.skills
    user_skills_collection = db.user_skills

    # Check if skill exists
    skill_doc = await skills_collection.find_one({"skill_number": skill_id})
    if not skill_doc:
        raise HTTPException(status_code=404, detail="Skill not found")

    # Delete all user assignments for this skill
    await user_skills_collection.delete_many({"skill_id": skill_id})

    # Delete the skill
    await skills_collection.delete_one({"skill_number": skill_id})

    return None


# ============== User Skills Management ==============

@router.get("/user/{user_id}", response_model=List[UserSkill])
async def get_user_skills(
    user_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get all skills for a specific user"""
    user_skills_collection = db.user_skills
    skills_collection = db.skills

    user_skills = []
    async for us_doc in user_skills_collection.find({"user_id": user_id}):
        # Get skill name
        skill_doc = await skills_collection.find_one({"skill_number": us_doc["skill_id"]})
        skill_name = skill_doc["name"] if skill_doc else "Unknown"

        user_skills.append(UserSkill(
            user_id=us_doc["user_id"],
            skill_id=us_doc["skill_id"],
            skill_name=skill_name,
            proficiency=us_doc["proficiency"],
            years_experience=us_doc.get("years_experience"),
            last_used=us_doc.get("last_used"),
            created_at=us_doc.get("created_at"),
            updated_at=us_doc.get("updated_at"),
        ))

    return user_skills


@router.post("/user", response_model=UserSkill, status_code=status.HTTP_201_CREATED)
async def add_user_skill(
    skill_data: UserSkillCreate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Add a skill to a user"""
    # Only admins or the user themselves can add skills
    if current_user.role != "admin" and current_user.id != skill_data.user_id:
        raise HTTPException(status_code=403, detail="You can only manage your own skills")

    user_skills_collection = db.user_skills
    skills_collection = db.skills

    # Verify skill exists
    skill_doc = await skills_collection.find_one({"skill_number": skill_data.skill_id})
    if not skill_doc:
        raise HTTPException(status_code=404, detail="Skill not found")

    # Check if user already has this skill
    existing = await user_skills_collection.find_one({
        "user_id": skill_data.user_id,
        "skill_id": skill_data.skill_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="User already has this skill")

    # Create user skill
    user_skill = {
        "user_id": skill_data.user_id,
        "skill_id": skill_data.skill_id,
        "proficiency": skill_data.proficiency,
        "years_experience": skill_data.years_experience,
        "last_used": skill_data.last_used,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
    }

    await user_skills_collection.insert_one(user_skill)

    return UserSkill(
        user_id=user_skill["user_id"],
        skill_id=user_skill["skill_id"],
        skill_name=skill_doc["name"],
        proficiency=user_skill["proficiency"],
        years_experience=user_skill.get("years_experience"),
        last_used=user_skill.get("last_used"),
        created_at=user_skill.get("created_at"),
        updated_at=user_skill.get("updated_at"),
    )


@router.post("/user/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_assign_skills(
    assignment: BulkSkillAssignment,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Bulk assign multiple skills to a user"""
    if current_user.role != "admin" and current_user.id != assignment.user_id:
        raise HTTPException(status_code=403, detail="You can only manage your own skills")

    user_skills_collection = db.user_skills
    skills_collection = db.skills

    created_skills = []
    for skill_info in assignment.skills:
        skill_id = skill_info.get("skill_id")
        proficiency = skill_info.get("proficiency", "beginner")
        years_experience = skill_info.get("years_experience")

        # Verify skill exists
        skill_doc = await skills_collection.find_one({"skill_number": skill_id})
        if not skill_doc:
            continue  # Skip invalid skills

        # Check if user already has this skill
        existing = await user_skills_collection.find_one({
            "user_id": assignment.user_id,
            "skill_id": skill_id
        })
        if existing:
            continue  # Skip duplicates

        # Create user skill
        user_skill = {
            "user_id": assignment.user_id,
            "skill_id": skill_id,
            "proficiency": proficiency,
            "years_experience": years_experience,
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
        }

        await user_skills_collection.insert_one(user_skill)
        created_skills.append(skill_id)

    return {"created": len(created_skills), "skill_ids": created_skills}


@router.put("/user/{user_id}/skill/{skill_id}", response_model=UserSkill)
async def update_user_skill(
    user_id: int,
    skill_id: int,
    skill_data: UserSkillUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Update a user's skill proficiency"""
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="You can only manage your own skills")

    user_skills_collection = db.user_skills
    skills_collection = db.skills

    # Find user skill
    us_doc = await user_skills_collection.find_one({
        "user_id": user_id,
        "skill_id": skill_id
    })
    if not us_doc:
        raise HTTPException(status_code=404, detail="User skill not found")

    # Build update data
    update_data = {"updated_at": datetime.now()}
    if skill_data.proficiency is not None:
        update_data["proficiency"] = skill_data.proficiency
    if skill_data.years_experience is not None:
        update_data["years_experience"] = skill_data.years_experience
    if skill_data.last_used is not None:
        update_data["last_used"] = skill_data.last_used

    # Update user skill
    await user_skills_collection.update_one(
        {"user_id": user_id, "skill_id": skill_id},
        {"$set": update_data}
    )

    # Fetch updated data
    updated_us = await user_skills_collection.find_one({"user_id": user_id, "skill_id": skill_id})
    skill_doc = await skills_collection.find_one({"skill_number": skill_id})

    return UserSkill(
        user_id=updated_us["user_id"],
        skill_id=updated_us["skill_id"],
        skill_name=skill_doc["name"] if skill_doc else "Unknown",
        proficiency=updated_us["proficiency"],
        years_experience=updated_us.get("years_experience"),
        last_used=updated_us.get("last_used"),
        created_at=updated_us.get("created_at"),
        updated_at=updated_us.get("updated_at"),
    )


@router.delete("/user/{user_id}/skill/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_user_skill(
    user_id: int,
    skill_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Remove a skill from a user"""
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="You can only manage your own skills")

    user_skills_collection = db.user_skills

    result = await user_skills_collection.delete_one({
        "user_id": user_id,
        "skill_id": skill_id
    })

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User skill not found")

    return None


# ============== User Availability Management ==============

@router.get("/availability/{user_id}", response_model=UserAvailability)
async def get_user_availability(
    user_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get availability status for a user"""
    availability_collection = db.user_availability

    avail_doc = await availability_collection.find_one({"user_id": user_id})
    if not avail_doc:
        # Return default availability
        return UserAvailability(
            user_id=user_id,
            status="available",
            current_workload=0,
            capacity=100,
        )

    return UserAvailability(
        user_id=avail_doc["user_id"],
        status=avail_doc.get("status", "available"),
        current_workload=avail_doc.get("current_workload", 0),
        capacity=avail_doc.get("capacity", 100),
        available_hours_per_week=avail_doc.get("available_hours_per_week"),
        updated_at=avail_doc.get("updated_at"),
    )


@router.put("/availability/{user_id}", response_model=UserAvailability)
async def update_user_availability(
    user_id: int,
    availability_data: UserAvailabilityUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Update user availability status"""
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="You can only manage your own availability")

    availability_collection = db.user_availability

    # Build update data
    update_data = {"updated_at": datetime.now()}
    if availability_data.status is not None:
        update_data["status"] = availability_data.status
    if availability_data.capacity is not None:
        update_data["capacity"] = availability_data.capacity
    if availability_data.available_hours_per_week is not None:
        update_data["available_hours_per_week"] = availability_data.available_hours_per_week

    # Upsert availability
    await availability_collection.update_one(
        {"user_id": user_id},
        {"$set": update_data},
        upsert=True
    )

    # Fetch updated data
    updated_avail = await availability_collection.find_one({"user_id": user_id})

    return UserAvailability(
        user_id=updated_avail["user_id"],
        status=updated_avail.get("status", "available"),
        current_workload=updated_avail.get("current_workload", 0),
        capacity=updated_avail.get("capacity", 100),
        available_hours_per_week=updated_avail.get("available_hours_per_week"),
        updated_at=updated_avail.get("updated_at"),
    )


# ============== Employee Profiles ==============

@router.get("/employees", response_model=List[EmployeeProfile])
async def get_all_employees(
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    skill_id: Optional[int] = None,
    status: Optional[str] = None,
):
    """Get all employees with their skills and availability"""
    users_collection = db.users
    user_skills_collection = db.user_skills
    availability_collection = db.user_availability
    skills_collection = db.skills

    # A non-admin may only see people they share a project with, not the whole org
    # directory (SEC-07). Global admins see everyone.
    allowed_user_ids: Optional[set] = None
    if current_user.role != "admin":
        mine = await db["project_members"].find(
            {"$or": [{"user_email": current_user.email}, {"user_id": current_user.id}]},
            {"project_id": 1},
        ).to_list(length=None)
        my_project_ids = [m["project_id"] for m in mine if m.get("project_id") is not None]
        comembers = await db["project_members"].find(
            {"project_id": {"$in": my_project_ids}}, {"user_id": 1},
        ).to_list(length=None)
        allowed_user_ids = {m["user_id"] for m in comembers if m.get("user_id") is not None}
        if current_user.id is not None:
            allowed_user_ids.add(current_user.id)

    employees = []

    async for user_doc in users_collection.find():
        user_id = user_doc.get("user_number")
        if not user_id:
            continue
        if allowed_user_ids is not None and user_id not in allowed_user_ids:
            continue

        # Get user skills
        user_skills = []
        async for us_doc in user_skills_collection.find({"user_id": user_id}):
            skill_doc = await skills_collection.find_one({"skill_number": us_doc["skill_id"]})
            if skill_doc:
                user_skills.append(UserSkill(
                    user_id=us_doc["user_id"],
                    skill_id=us_doc["skill_id"],
                    skill_name=skill_doc["name"],
                    proficiency=us_doc["proficiency"],
                    years_experience=us_doc.get("years_experience"),
                    last_used=us_doc.get("last_used"),
                    created_at=us_doc.get("created_at"),
                    updated_at=us_doc.get("updated_at"),
                ))

        # Filter by skill if requested
        if skill_id and not any(s.skill_id == skill_id for s in user_skills):
            continue

        # Get availability
        avail_doc = await availability_collection.find_one({"user_id": user_id})
        availability = None
        if avail_doc:
            availability = UserAvailability(
                user_id=avail_doc["user_id"],
                status=avail_doc.get("status", "available"),
                current_workload=avail_doc.get("current_workload", 0),
                capacity=avail_doc.get("capacity", 100),
                available_hours_per_week=avail_doc.get("available_hours_per_week"),
                updated_at=avail_doc.get("updated_at"),
            )

        # Filter by status if requested
        if status and (not availability or availability.status != status):
            continue

        employees.append(EmployeeProfile(
            id=user_id,
            name=user_doc.get("name", ""),
            email=user_doc.get("email", ""),
            role=user_doc.get("role", "user"),
            designation=user_doc.get("designation"),
            department=user_doc.get("department"),
            title=user_doc.get("title"),
            skills=user_skills,
            availability=availability,
            created_at=user_doc.get("created_at"),
        ))

    return employees


@router.get("/employees/{user_id}", response_model=EmployeeProfile)
async def get_employee_profile(
    user_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Get complete employee profile with skills and availability"""
    users_collection = db.users
    user_skills_collection = db.user_skills
    availability_collection = db.user_availability
    skills_collection = db.skills
    tickets_collection = db.tickets

    # Get user
    user_doc = await users_collection.find_one({"user_number": user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    # Get user skills
    user_skills = []
    async for us_doc in user_skills_collection.find({"user_id": user_id}):
        skill_doc = await skills_collection.find_one({"skill_number": us_doc["skill_id"]})
        if skill_doc:
            user_skills.append(UserSkill(
                user_id=us_doc["user_id"],
                skill_id=us_doc["skill_id"],
                skill_name=skill_doc["name"],
                proficiency=us_doc["proficiency"],
                years_experience=us_doc.get("years_experience"),
                last_used=us_doc.get("last_used"),
                created_at=us_doc.get("created_at"),
                updated_at=us_doc.get("updated_at"),
            ))

    # Get availability
    avail_doc = await availability_collection.find_one({"user_id": user_id})
    availability = None
    if avail_doc:
        availability = UserAvailability(
            user_id=avail_doc["user_id"],
            status=avail_doc.get("status", "available"),
            current_workload=avail_doc.get("current_workload", 0),
            capacity=avail_doc.get("capacity", 100),
            available_hours_per_week=avail_doc.get("available_hours_per_week"),
            updated_at=avail_doc.get("updated_at"),
        )

    # Calculate performance metrics
    total_completed = await tickets_collection.count_documents({
        "assignee_id": user_id,
        "status_name": {"$in": ["Done", "Closed", "Resolved"]}
    })

    return EmployeeProfile(
        id=user_id,
        name=user_doc.get("name", ""),
        email=user_doc.get("email", ""),
        role=user_doc.get("role", "user"),
        designation=user_doc.get("designation"),
        department=user_doc.get("department"),
        title=user_doc.get("title"),
        skills=user_skills,
        availability=availability,
        total_tickets_completed=total_completed,
        created_at=user_doc.get("created_at"),
    )


@router.put("/employees/{user_id}/profile", response_model=EmployeeProfile)
async def update_user_profile(
    user_id: int,
    profile_data: UserProfileUpdate,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Update user profile (designation, department) - Admin only"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update user profiles")

    users_collection = db.users

    # Check if user exists
    user_doc = await users_collection.find_one({"user_number": user_id})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")

    # Build update dict
    update_data = {}
    if profile_data.designation is not None:
        update_data["designation"] = profile_data.designation
    if profile_data.department is not None:
        update_data["department"] = profile_data.department

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    # Update user
    await users_collection.update_one(
        {"user_number": user_id},
        {"$set": update_data}
    )

    # Return updated profile
    return await get_employee_profile(user_id, db, current_user)
