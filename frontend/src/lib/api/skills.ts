/**
 * Skills and Employee Pool API Client
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ========== Types ==========

export interface Skill {
  id: number;
  name: string;
  category: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserSkill {
  user_id: number;
  skill_id: number;
  skill_name: string;
  proficiency: 'beginner' | 'intermediate' | 'expert';
  years_experience?: number;
  last_used?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserAvailability {
  user_id: number;
  status: 'available' | 'busy' | 'unavailable';
  current_workload: number;
  capacity: number;
  available_hours_per_week?: number;
  updated_at?: string;
}

export interface EmployeeProfile {
  id: number;
  name: string;
  email: string;
  role: string;
  designation?: string; // e.g., "Senior Developer", "Junior Developer", "Tech Lead"
  department?: string;
  title?: string; // Deprecated: use designation instead
  profile_photo?: string;
  skills: UserSkill[];
  availability?: UserAvailability;
  total_tickets_completed: number;
  average_completion_time?: number;
  performance_score?: number;
  created_at?: string;
  last_synced?: string;
}

export interface RecommendationResult {
  user_id: number;
  name: string;
  email: string;
  designation?: string;
  match_score: number;
  matching_skills: string[];
  proficiency_level: string;
  current_workload: number;
  availability_status: string;
  reason: string;
}

// ========== Helper Functions ==========

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ========== Skills API ==========

export const skillsAPI = {
  // Get all skills
  getSkills: async (category?: string): Promise<Skill[]> => {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    return fetchAPI<Skill[]>(`/skills${params}`);
  },

  // Create skill (admin only)
  createSkill: async (name: string, category: string): Promise<Skill> => {
    return fetchAPI<Skill>('/skills', {
      method: 'POST',
      body: JSON.stringify({ name, category }),
    });
  },

  // Update skill (admin only)
  updateSkill: async (skillId: number, data: Partial<Skill>): Promise<Skill> => {
    return fetchAPI<Skill>(`/skills/${skillId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Delete skill (admin only)
  deleteSkill: async (skillId: number): Promise<void> => {
    return fetchAPI<void>(`/skills/${skillId}`, {
      method: 'DELETE',
    });
  },

  // Get user skills
  getUserSkills: async (userId: number): Promise<UserSkill[]> => {
    return fetchAPI<UserSkill[]>(`/skills/user/${userId}`);
  },

  // Add skill to user
  addUserSkill: async (
    userId: number,
    skillId: number,
    proficiency: 'beginner' | 'intermediate' | 'expert',
    yearsExperience?: number
  ): Promise<UserSkill> => {
    return fetchAPI<UserSkill>('/skills/user', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        skill_id: skillId,
        proficiency,
        years_experience: yearsExperience,
      }),
    });
  },

  // Bulk assign skills
  bulkAssignSkills: async (
    userId: number,
    skills: Array<{ skill_id: number; proficiency: string; years_experience?: number }>
  ): Promise<{ created: number; skill_ids: number[] }> => {
    return fetchAPI<{ created: number; skill_ids: number[] }>('/skills/user/bulk', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        skills,
      }),
    });
  },

  // Update user skill
  updateUserSkill: async (
    userId: number,
    skillId: number,
    data: {
      proficiency?: 'beginner' | 'intermediate' | 'expert';
      years_experience?: number;
      last_used?: string;
    }
  ): Promise<UserSkill> => {
    return fetchAPI<UserSkill>(`/skills/user/${userId}/skill/${skillId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Remove skill from user
  removeUserSkill: async (userId: number, skillId: number): Promise<void> => {
    return fetchAPI<void>(`/skills/user/${userId}/skill/${skillId}`, {
      method: 'DELETE',
    });
  },

  // Get user availability
  getUserAvailability: async (userId: number): Promise<UserAvailability> => {
    return fetchAPI<UserAvailability>(`/skills/availability/${userId}`);
  },

  // Update user availability
  updateUserAvailability: async (
    userId: number,
    data: {
      status?: 'available' | 'busy' | 'unavailable';
      capacity?: number;
      available_hours_per_week?: number;
    }
  ): Promise<UserAvailability> => {
    return fetchAPI<UserAvailability>(`/skills/availability/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Get all employees
  getEmployees: async (filters?: {
    skill_id?: number;
    status?: string;
  }): Promise<EmployeeProfile[]> => {
    const params = new URLSearchParams();
    if (filters?.skill_id) params.append('skill_id', filters.skill_id.toString());
    if (filters?.status) params.append('status', filters.status);

    const query = params.toString();
    return fetchAPI<EmployeeProfile[]>(`/skills/employees${query ? `?${query}` : ''}`);
  },

  // Get employee profile
  getEmployeeProfile: async (userId: number): Promise<EmployeeProfile> => {
    return fetchAPI<EmployeeProfile>(`/skills/employees/${userId}`);
  },

  // Update user profile (designation, department) - Admin only
  updateUserProfile: async (
    userId: number,
    data: {
      designation?: string;
      department?: string;
    }
  ): Promise<EmployeeProfile> => {
    return fetchAPI<EmployeeProfile>(`/skills/employees/${userId}/profile`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// ========== Recommendations API ==========

export const recommendationsAPI = {
  // Get developer recommendations
  getRecommendations: async (
    requiredSkills: string[],
    options?: {
      project_id?: number;
      ticket_type?: string;
      priority?: string;
      estimated_hours?: number;
      limit?: number;
    }
  ): Promise<RecommendationResult[]> => {
    return fetchAPI<RecommendationResult[]>('/recommendations', {
      method: 'POST',
      body: JSON.stringify({
        required_skills: requiredSkills,
        ...options,
      }),
    });
  },

  // Get recommendations for an existing ticket
  getRecommendationsForTicket: async (
    ticketId: number,
    limit: number = 5
  ): Promise<RecommendationResult[]> => {
    return fetchAPI<RecommendationResult[]>(
      `/recommendations/for-ticket/${ticketId}?limit=${limit}`
    );
  },
};
