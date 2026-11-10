export type Tab = 'overview' | 'deployments' | 'changelog' | 'commits' | 'metrics';

export interface EditFormData {
  name: string;
  version: string;
  description: string;
  release_notes: string;
  release_date: string;
  git_merge_mr: string;
  git_tag: string;
  git_branch: string;
}

export const RELEASE_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'released', label: 'Released' },
  { value: 'archived', label: 'Archived' },
];

export interface StatusVisual {
  label: string;
  color: string;
  bg: string;
}

export const STATUS_VISUALS: Record<string, StatusVisual> = {
  planned: { label: 'Planned', color: '#5E6C84', bg: '#F4F5F7' },
  'in-progress': { label: 'In Progress', color: '#0052CC', bg: '#DEEBFF' },
  released: { label: 'Released', color: '#00875A', bg: '#E3FCEF' },
  archived: { label: 'Archived', color: '#97A0AF', bg: '#F4F5F7' },
};

export const ENV_VISUALS: Record<string, StatusVisual> = {
  production: { label: 'Production', color: '#00875A', bg: '#E3FCEF' },
  staging: { label: 'Staging', color: '#FF991F', bg: '#FFF7E6' },
  dev: { label: 'Development', color: '#0052CC', bg: '#DEEBFF' },
  qa: { label: 'QA', color: '#5243AA', bg: '#EAE6FF' },
};

export const DEPLOY_STATUS_VISUALS: Record<string, StatusVisual> = {
  success: { label: 'Success', color: '#00875A', bg: '#E3FCEF' },
  failed: { label: 'Failed', color: '#DE350B', bg: '#FFEBE6' },
  in_progress: { label: 'In Progress', color: '#FF991F', bg: '#FFF7E6' },
  rolled_back: { label: 'Rolled Back', color: '#5E6C84', bg: '#F4F5F7' },
};

export const CATEGORY_VISUALS: Record<string, StatusVisual> = {
  feature: { label: 'Feature', color: '#00875A', bg: '#E3FCEF' },
  fix: { label: 'Fix', color: '#DE350B', bg: '#FFEBE6' },
  breaking: { label: 'Breaking', color: '#BF2600', bg: '#FFEBE6' },
  enhancement: { label: 'Enhancement', color: '#0052CC', bg: '#DEEBFF' },
  docs: { label: 'Docs', color: '#5E6C84', bg: '#F4F5F7' },
};

export const ENVIRONMENTS = [
  { value: 'dev', label: 'Development' },
  { value: 'staging', label: 'Staging' },
  { value: 'production', label: 'Production' },
  { value: 'qa', label: 'QA' },
];

export const getStatusVisual = (status: string): StatusVisual =>
  STATUS_VISUALS[status] || { label: status, color: '#5E6C84', bg: '#F4F5F7' };

export const getEnvVisual = (env: string): StatusVisual =>
  ENV_VISUALS[env] || { label: env, color: '#5E6C84', bg: '#F4F5F7' };

export const getDeployStatusVisual = (status: string): StatusVisual =>
  DEPLOY_STATUS_VISUALS[status] || { label: status, color: '#5E6C84', bg: '#F4F5F7' };

export const getCategoryVisual = (category: string): StatusVisual =>
  CATEGORY_VISUALS[category] || { label: category, color: '#5E6C84', bg: '#F4F5F7' };
