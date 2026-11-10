import { apiGet, apiPost, apiPut } from './client';

export interface UserOut {
  email: string; // Primary unique identifier
  name: string;
  user_id: number; // Legacy field, may have duplicates
  role: string;
  designation?: string;
  department?: string;
  is_active: boolean;
  created_at: string;
}

export interface UserUpdateRequest {
  is_active?: boolean;
}

export async function getAllUsers(): Promise<UserOut[]> {
  return apiGet<UserOut[]>('/admin/users');
}

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  role?: 'user' | 'admin';
  department?: string | null;
  designation?: string | null;
}

export async function createUser(data: CreateUserRequest): Promise<UserOut> {
  return apiPost<CreateUserRequest, UserOut>('/admin/users', data);
}

export async function updateUser(email: string, data: UserUpdateRequest): Promise<{ success: boolean; message: string; updated_fields?: string[] }> {
  // URL encode email to handle special characters like @ and .
  const encodedEmail = encodeURIComponent(email);
  return apiPut(`/admin/users/${encodedEmail}`, data);
}
