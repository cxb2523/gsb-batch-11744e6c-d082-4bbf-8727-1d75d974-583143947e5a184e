import React from 'react';
import { Users, UserPlus, Shield, Download, Activity, TrendingUp } from 'lucide-react';
import { tokens } from '../../../../../design-system/tokens';
import { ButtonCore } from '@/components/ui';

interface MembersStats {
  totalMembers: number;
  projectAdmins: number;
  activeMembers: number;
  avgIssues: number;
}

interface MembersHeaderProps {
  stats: MembersStats;
  isProjectAdmin: boolean;
  onExport: () => void;
  onInvite: () => void;
}

export function MembersHeader({ stats, isProjectAdmin, onExport, onInvite }: MembersHeaderProps) {
  return (
    <div style={{
      marginBottom: tokens.spacing[8],
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: tokens.spacing[6],
      }}>
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: tokens.spacing[3],
            marginBottom: tokens.spacing[2],
          }}>
            <div style={{
              padding: tokens.spacing[2],
              background: `linear-gradient(135deg, ${tokens.colors.primary[500]} 0%, ${tokens.colors.primary[600]} 100%)`,
              borderRadius: tokens.borderRadius.lg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 4px 12px ${tokens.colors.primary[500]}30`,
            }}>
              <Users size={24} color="#fff" strokeWidth={2} />
            </div>
            <h1 style={{
              fontSize: tokens.typography.sizes['4xl'],
              fontWeight: tokens.typography.weights.bold,
              color: tokens.colors.neutral[900],
              margin: 0,
              letterSpacing: '-0.02em',
            }}>
              Team Members
            </h1>
          </div>
          <p style={{
            fontSize: tokens.typography.sizes.base,
            color: tokens.colors.neutral[600],
            margin: 0,
            lineHeight: 1.5,
          }}>
            Manage your team members, roles, and permissions
          </p>
        </div>
        <div style={{ display: 'flex', gap: tokens.spacing[3] }}>
          <ButtonCore
            variant="secondary"
            onClick={onExport}
            leftIcon={<Download size={18} />}
          >
            Export
          </ButtonCore>
          {isProjectAdmin && (
            <ButtonCore
              variant="primary"
              onClick={onInvite}
              leftIcon={<UserPlus size={18} />}
            >
              Invite Member
            </ButtonCore>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: tokens.spacing[4],
      }}>
        {[
          { label: 'Total Members', value: stats.totalMembers, icon: Users, color: tokens.colors.primary[600], gradient: `linear-gradient(135deg, ${tokens.colors.primary[50]} 0%, ${tokens.colors.primary[100]} 100%)` },
          { label: 'Project Admins', value: stats.projectAdmins, icon: Shield, color: tokens.colors.primary[600], gradient: `linear-gradient(135deg, ${tokens.colors.primary[50]} 0%, ${tokens.colors.primary[100]} 100%)` },
          { label: 'Active Members', value: stats.activeMembers, icon: Activity, color: tokens.colors.success[600], gradient: `linear-gradient(135deg, ${tokens.colors.success[50]} 0%, ${tokens.colors.success[100]} 100%)` },
          { label: 'Avg. Issues/Member', value: stats.avgIssues, icon: TrendingUp, color: tokens.colors.info[600], gradient: `linear-gradient(135deg, ${tokens.colors.info[50]} 0%, ${tokens.colors.info[100]} 100%)` },
        ].map((stat, index) => (
          <div
            key={index}
            style={{
              background: '#fff',
              border: `1px solid ${tokens.colors.neutral[200]}`,
              borderRadius: tokens.borderRadius.xl,
              padding: tokens.spacing[5],
              position: 'relative',
              overflow: 'hidden',
              boxShadow: tokens.shadows.sm,
              transition: `all ${tokens.animation.duration.fast}`,
              cursor: 'default',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = tokens.shadows.md;
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = tokens.shadows.sm;
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '120px',
              height: '120px',
              background: stat.gradient,
              borderRadius: '50%',
              filter: 'blur(40px)',
              opacity: 0.6,
              pointerEvents: 'none',
            }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: tokens.spacing[2],
                marginBottom: tokens.spacing[3],
              }}>
                <div style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                }}>
                  <stat.icon size={18} color={stat.color} strokeWidth={2} />
                </div>
                <span style={{
                  fontSize: tokens.typography.sizes.sm,
                  fontWeight: tokens.typography.weights.medium,
                  color: tokens.colors.neutral[600],
                  lineHeight: 1.4,
                  flex: 1,
                }}>
                  {stat.label}
                </span>
              </div>
              <div style={{
                fontSize: tokens.typography.sizes['3xl'],
                fontWeight: tokens.typography.weights.bold,
                color: tokens.colors.neutral[900],
                lineHeight: 1.2,
              }}>
                {stat.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
