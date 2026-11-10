import { Users, Shield, Eye, UserCheck } from 'lucide-react';
import { tokens } from '../../../../../design-system/tokens';

export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const getRoleBadgeConfig = (role: string) => {
  switch (role) {
    case 'admin':
      // Shield (not Crown) so project admins are never confused with global
      // admins — Crown + warning/yellow is reserved for global admins.
      return {
        icon: Shield,
        color: tokens.colors.primary[600],
        bg: tokens.colors.primary[50],
        border: tokens.colors.primary[200],
        label: 'Project Admin',
        description: 'Full access to all project features'
      };
    case 'member':
      return {
        icon: UserCheck,
        color: tokens.colors.success[600],
        bg: tokens.colors.success[50],
        border: tokens.colors.success[200],
        label: 'Member',
        description: 'Can create and edit issues'
      };
    case 'viewer':
      return {
        icon: Eye,
        color: tokens.colors.neutral[600],
        bg: tokens.colors.neutral[50],
        border: tokens.colors.neutral[200],
        label: 'Viewer',
        description: 'Read-only access'
      };
    default:
      return {
        icon: Users,
        color: tokens.colors.neutral[600],
        bg: tokens.colors.neutral[50],
        border: tokens.colors.neutral[200],
        label: role,
        description: ''
      };
  }
};

export const formatLastActive = (dateString?: string) => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};
