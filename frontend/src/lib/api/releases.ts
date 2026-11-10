import { apiGet, apiPost, apiPut, apiDelete } from './client';

// ========== Deployment Interfaces ==========

export interface DeploymentRecord {
  environment: 'dev' | 'staging' | 'production' | 'qa';
  deployed_at: string;
  deployed_by: number;
  deployed_by_name?: string;
  status: 'success' | 'failed' | 'in_progress' | 'rolled_back';
  commit_hash?: string;
  notes?: string;
}

export interface ChangelogItem {
  category: 'feature' | 'fix' | 'breaking' | 'enhancement' | 'docs' | 'other';
  description: string;
  ticket_key?: string;
  ticket_id?: number;
  commit_hash?: string;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
  ticket_ids?: number[];
}

export interface ReleaseMetrics {
  lead_time_days?: number;
  deployment_count: number;
  rollback_count: number;
  tickets_completed: number;
  tickets_total: number;
  code_changes_count: number;
}

// ========== Release Interfaces ==========

export interface Release {
  id: number;
  project_id: number;
  name: string;
  version: string;
  description?: string;
  release_notes?: string;
  release_date?: string;
  git_merge_mr?: string;
  status: 'planned' | 'in-progress' | 'released' | 'archived';
  ticket_count: number;
  created_at: string;
  updated_at?: string;

  // Git integration
  git_tag?: string;
  git_branch?: string;
  commits?: GitCommit[];

  // Deployment tracking
  deployments?: DeploymentRecord[];
  current_environments?: string[];

  // Changelog
  changelog_items?: ChangelogItem[];
  auto_generated_changelog?: boolean;

  // Metrics
  metrics?: ReleaseMetrics;
  first_commit_date?: string;
  release_completed_date?: string;
}

export interface CreateReleaseData {
  name: string;
  version: string;
  description?: string;
  release_notes?: string;
  release_date?: string;
  git_merge_mr?: string;
  ticket_ids?: number[];
  git_tag?: string;
  git_branch?: string;
  commits?: GitCommit[];
}

export interface UpdateReleaseData {
  name?: string;
  version?: string;
  description?: string;
  release_notes?: string;
  release_date?: string;
  git_merge_mr?: string;
  ticket_ids?: number[];
  status?: 'planned' | 'in-progress' | 'released' | 'archived';
  git_tag?: string;
  git_branch?: string;
  commits?: GitCommit[];
  changelog_items?: ChangelogItem[];
}

export interface DeploymentCreateData {
  environment: 'dev' | 'staging' | 'production' | 'qa';
  status?: 'success' | 'failed' | 'in_progress';
  commit_hash?: string;
  notes?: string;
}

export interface ReleaseTicket {
  id: number;
  key: string;
  title: string;
  description?: string;
  type: string;
  status: {
    id: number;
    name: string;
    color: string;
  };
  assignee?: {
    id: number;
    name: string;
    email: string;
  };
  story_points?: number;
  priority?: string;
  labels: string[];
  created_at: string;
  due_date?: string;
}

export async function getReleases(projectId: number): Promise<Release[]> {
  return apiGet<Release[]>(`/projects/${projectId}/releases`);
}

export async function getRelease(projectId: number, releaseId: number): Promise<Release> {
  return apiGet<Release>(`/projects/${projectId}/releases/${releaseId}`);
}

export async function createRelease(projectId: number, data: CreateReleaseData): Promise<Release> {
  return apiPost<CreateReleaseData, Release>(`/projects/${projectId}/releases`, data);
}

export async function updateRelease(projectId: number, releaseId: number, data: UpdateReleaseData): Promise<Release> {
  return apiPut<UpdateReleaseData, Release>(`/projects/${projectId}/releases/${releaseId}`, data);
}

export async function deleteRelease(projectId: number, releaseId: number): Promise<void> {
  return apiDelete(`/projects/${projectId}/releases/${releaseId}`);
}

export async function getReleaseTickets(projectId: number, releaseId: number): Promise<ReleaseTicket[]> {
  return apiGet<ReleaseTicket[]>(`/projects/${projectId}/releases/${releaseId}/tickets`);
}

export async function createDeployment(
  projectId: number,
  releaseId: number,
  data: DeploymentCreateData
): Promise<Release> {
  return apiPost<DeploymentCreateData, Release>(
    `/projects/${projectId}/releases/${releaseId}/deployments`,
    data
  );
}
