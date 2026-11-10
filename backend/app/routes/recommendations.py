"""
Developer Recommendation Engine API
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, List, Optional, Dict
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime

from ..db.mongo import get_mongo_db
from ..core.security import get_current_user, CurrentUser
from ..models.skills import RecommendationRequest, RecommendationResult

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


async def calculate_match_score(
    user_skills: List[dict],
    required_skills: List[str],
    availability: dict,
    workload: int,
    user_designation: Optional[str] = None,
    preferred_designation: Optional[str] = None,
) -> tuple[float, List[str], str, str]:
    """
    Calculate how well a user matches the requirements

    Returns: (score, matching_skills, proficiency_level, reason)
    """
    if not required_skills:
        # If no specific skills required, base on availability
        base_score = 50.0
    else:
        # Calculate skill match
        user_skill_names = {s["skill_name"].lower(): s for s in user_skills}
        matching_skills = []
        skill_scores = []

        for req_skill in required_skills:
            req_skill_lower = req_skill.lower()
            if req_skill_lower in user_skill_names:
                matching_skills.append(req_skill)
                skill_data = user_skill_names[req_skill_lower]

                # Score based on proficiency
                proficiency_scores = {
                    "beginner": 60,
                    "intermediate": 80,
                    "expert": 100
                }
                skill_score = proficiency_scores.get(skill_data.get("proficiency", "beginner"), 60)

                # Bonus for years of experience
                years = skill_data.get("years_experience", 0) or 0
                if years >= 5:
                    skill_score += 10
                elif years >= 2:
                    skill_score += 5

                skill_scores.append(skill_score)

        if not matching_skills:
            # No matching skills
            return 0.0, [], "none", "No matching skills"

        # Average skill match score
        base_score = sum(skill_scores) / len(skill_scores)

        # Penalty if not all required skills are matched
        match_ratio = len(matching_skills) / len(required_skills)
        base_score *= match_ratio

    # Determine overall proficiency level
    if not user_skills:
        proficiency_level = "none"
    else:
        proficiency_counts = {}
        for s in user_skills:
            prof = s.get("proficiency", "beginner")
            proficiency_counts[prof] = proficiency_counts.get(prof, 0) + 1

        if proficiency_counts.get("expert", 0) >= 2:
            proficiency_level = "expert"
        elif proficiency_counts.get("intermediate", 0) >= 2:
            proficiency_level = "intermediate"
        else:
            proficiency_level = "beginner"

    # Adjust score based on availability
    status = availability.get("status", "available")
    capacity = availability.get("capacity", 100)

    if status == "unavailable":
        base_score *= 0.3  # Heavy penalty
    elif status == "busy":
        base_score *= 0.7  # Moderate penalty

    # Adjust based on current workload
    if workload == 0:
        workload_multiplier = 1.2  # Bonus for being free
    elif workload <= 3:
        workload_multiplier = 1.0  # Normal
    elif workload <= 5:
        workload_multiplier = 0.8  # Light penalty
    else:
        workload_multiplier = 0.5  # Heavy penalty for being overloaded

    base_score *= workload_multiplier

    # Adjust based on capacity
    if capacity >= 80:
        capacity_multiplier = 1.0
    elif capacity >= 50:
        capacity_multiplier = 0.9
    else:
        capacity_multiplier = 0.7

    base_score *= capacity_multiplier

    # Adjust based on designation match
    designation_multiplier = 1.0
    if preferred_designation and user_designation:
        # Define designation hierarchy for intelligent matching
        senior_designations = ["senior developer", "senior engineer", "tech lead", "lead developer", "principal engineer", "staff engineer"]
        mid_designations = ["developer", "software engineer", "engineer"]
        junior_designations = ["junior developer", "junior engineer", "associate engineer"]

        user_desg_lower = user_designation.lower()
        preferred_desg_lower = preferred_designation.lower()

        # Exact match gets bonus
        if user_desg_lower == preferred_desg_lower:
            designation_multiplier = 1.15  # 15% bonus for exact match
        # Senior to senior-level tasks
        elif any(sd in preferred_desg_lower for sd in senior_designations):
            if any(sd in user_desg_lower for sd in senior_designations):
                designation_multiplier = 1.1  # Good match
            elif any(md in user_desg_lower for md in mid_designations):
                designation_multiplier = 0.9  # Slight penalty for mid-level
            else:
                designation_multiplier = 0.7  # Penalty for junior
        # Mid-level tasks
        elif any(md in preferred_desg_lower for md in mid_designations):
            if any(md in user_desg_lower for md in mid_designations):
                designation_multiplier = 1.1  # Good match
            elif any(sd in user_desg_lower for sd in senior_designations):
                designation_multiplier = 1.05  # Senior can do mid-level
            else:
                designation_multiplier = 0.85  # Junior slightly less suitable
        # Junior-level tasks
        elif any(jd in preferred_desg_lower for jd in junior_designations):
            if any(jd in user_desg_lower for jd in junior_designations):
                designation_multiplier = 1.1  # Good match
            else:
                designation_multiplier = 1.0  # Anyone can do junior tasks

    base_score *= designation_multiplier

    # Generate recommendation reason
    reasons = []
    if required_skills and matching_skills:
        reasons.append(f"Matches {len(matching_skills)}/{len(required_skills)} required skills")
    if proficiency_level == "expert":
        reasons.append("Expert level proficiency")
    elif proficiency_level == "intermediate":
        reasons.append("Intermediate proficiency")

    # Add designation match info
    if preferred_designation and user_designation:
        if designation_multiplier >= 1.1:
            reasons.append(f"Good designation match ({user_designation})")
        elif designation_multiplier < 0.9:
            reasons.append(f"Designation mismatch (has {user_designation}, needs {preferred_designation})")

    if status == "available" and workload == 0:
        reasons.append("Fully available")
    elif status == "available" and workload <= 3:
        reasons.append("Available with light workload")
    elif status == "busy":
        reasons.append("Currently busy but manageable")
    else:
        reasons.append("Limited availability")

    reason = "; ".join(reasons) if reasons else "Available developer"

    return (
        min(100.0, max(0.0, base_score)),  # Clamp to 0-100
        matching_skills if required_skills else [],
        proficiency_level,
        reason
    )


@router.post("", response_model=List[RecommendationResult])
async def get_developer_recommendations(
    request: RecommendationRequest,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Get recommended developers based on skills, availability, and workload
    """
    users_collection = db.users
    user_skills_collection = db.user_skills
    availability_collection = db.user_availability
    skills_collection = db.skills
    tickets_collection = db.tickets

    recommendations = []

    # Iterate through all users
    async for user_doc in users_collection.find():
        user_id = user_doc.get("user_number")
        if not user_id:
            continue

        # Get user skills
        user_skills = []
        async for us_doc in user_skills_collection.find({"user_id": user_id}):
            skill_doc = await skills_collection.find_one({"skill_number": us_doc["skill_id"]})
            if skill_doc:
                user_skills.append({
                    "skill_id": us_doc["skill_id"],
                    "skill_name": skill_doc["name"],
                    "proficiency": us_doc["proficiency"],
                    "years_experience": us_doc.get("years_experience"),
                })

        # Get availability
        avail_doc = await availability_collection.find_one({"user_id": user_id})
        availability = avail_doc if avail_doc else {
            "status": "available",
            "capacity": 100,
            "current_workload": 0
        }

        # Calculate current workload (number of active tickets)
        active_tickets = await tickets_collection.count_documents({
            "assignee_id": user_id,
            "status_name": {"$nin": ["Done", "Closed", "Resolved", "Cancelled"]}
        })

        # Update workload in availability if different
        if avail_doc and avail_doc.get("current_workload") != active_tickets:
            await availability_collection.update_one(
                {"user_id": user_id},
                {"$set": {"current_workload": active_tickets, "updated_at": datetime.now()}}
            )

        # Calculate match score
        score, matching_skills, proficiency, reason = await calculate_match_score(
            user_skills,
            request.required_skills,
            availability,
            active_tickets,
            user_doc.get("designation"),
            request.preferred_designation,
        )

        # Filter out developers with very low scores
        if score < 10:
            continue

        recommendations.append(RecommendationResult(
            user_id=user_id,
            name=user_doc.get("name", ""),
            email=user_doc.get("email", ""),
            designation=user_doc.get("designation"),
            match_score=round(score, 2),
            matching_skills=matching_skills,
            proficiency_level=proficiency,
            current_workload=active_tickets,
            availability_status=availability.get("status", "available"),
            reason=reason,
        ))

    # Sort by match score (highest first)
    recommendations.sort(key=lambda x: x.match_score, reverse=True)

    # Limit results
    recommendations = recommendations[:request.limit]

    # Log recommendation request for analytics
    if recommendations:
        history_collection = db.recommendation_history
        await history_collection.insert_one({
            "project_id": request.project_id,
            "ticket_type": request.ticket_type,
            "required_skills": request.required_skills,
            "priority": request.priority,
            "top_recommendation_user_id": recommendations[0].user_id,
            "top_recommendation_score": recommendations[0].match_score,
            "total_candidates": len(recommendations),
            "requested_by": current_user.id,
            "created_at": datetime.now(),
        })

    return recommendations


@router.get("/for-ticket/{ticket_id}", response_model=List[RecommendationResult])
async def get_recommendations_for_ticket(
    ticket_id: int,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    limit: int = 5,
):
    """
    Get developer recommendations for an existing ticket based on its properties
    """
    tickets_collection = db.tickets

    # Get ticket
    ticket_doc = await tickets_collection.find_one({"ticket_number": ticket_id})
    if not ticket_doc:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Extract skills from ticket description and title (simple keyword matching)
    # In a real implementation, you might use NLP or ML for better skill extraction
    text = f"{ticket_doc.get('title', '')} {ticket_doc.get('description', '')}".lower()

    # Common skill keywords
    skill_keywords = [
        "react", "vue", "angular", "typescript", "javascript",
        "python", "fastapi", "django", "node", "express",
        "mongodb", "postgresql", "mysql", "redis",
        "docker", "kubernetes", "aws", "azure",
        "ui/ux", "design", "figma",
        "testing", "qa", "jest", "pytest"
    ]

    detected_skills = [skill for skill in skill_keywords if skill in text]

    # Create recommendation request
    request = RecommendationRequest(
        project_id=ticket_doc.get("project_id"),
        ticket_type=ticket_doc.get("type"),
        required_skills=detected_skills,
        priority=ticket_doc.get("priority"),
        limit=limit,
    )

    return await get_developer_recommendations(request, db, current_user)
