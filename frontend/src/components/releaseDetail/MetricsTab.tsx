import React from 'react';
import { Release } from '@/lib/api/releases';
import { sectionLabelStyle, sectionHeadingStyle } from './styles';

interface MetricsTabProps {
  release: Release;
}

export function MetricsTab({ release }: MetricsTabProps) {
  return (
    <div>
      <h3 style={sectionHeadingStyle}>Release metrics</h3>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
      }}>
        {/* Lead Time */}
        <div style={{
          padding: 16,
          backgroundColor: '#FFFFFF',
          border: '1px solid #DFE1E6',
          borderRadius: 3,
        }}>
          <div style={sectionLabelStyle}>Lead time</div>
          <div style={{
            fontSize: 24,
            fontWeight: 600,
            color: '#172B4D',
            lineHeight: 1,
            marginBottom: 4,
          }}>
            {release.metrics?.lead_time_days !== null && release.metrics?.lead_time_days !== undefined
              ? `${Math.round(release.metrics.lead_time_days)}`
              : '—'}
          </div>
          <div style={{
            fontSize: 12,
            color: '#6B778C',
          }}>
            {release.metrics?.lead_time_days !== null && release.metrics?.lead_time_days !== undefined
              ? 'days from first commit to release'
              : 'No data available'}
          </div>
        </div>

        {/* Deployments */}
        <div style={{
          padding: 16,
          backgroundColor: '#FFFFFF',
          border: '1px solid #DFE1E6',
          borderRadius: 3,
        }}>
          <div style={sectionLabelStyle}>Deployments</div>
          <div style={{
            fontSize: 24,
            fontWeight: 600,
            color: '#00875A',
            lineHeight: 1,
            marginBottom: 4,
          }}>
            {release.metrics?.deployment_count || 0}
          </div>
          <div style={{
            fontSize: 12,
            color: '#6B778C',
          }}>
            total deployments
          </div>
        </div>

        {/* Rollbacks */}
        <div style={{
          padding: 16,
          backgroundColor: '#FFFFFF',
          border: '1px solid #DFE1E6',
          borderRadius: 3,
        }}>
          <div style={sectionLabelStyle}>Rollbacks</div>
          <div style={{
            fontSize: 24,
            fontWeight: 600,
            color: '#DE350B',
            lineHeight: 1,
            marginBottom: 4,
          }}>
            {release.metrics?.rollback_count || 0}
          </div>
          <div style={{
            fontSize: 12,
            color: '#6B778C',
          }}>
            deployment rollbacks
          </div>
        </div>

        {/* Code Changes */}
        <div style={{
          padding: 16,
          backgroundColor: '#FFFFFF',
          border: '1px solid #DFE1E6',
          borderRadius: 3,
        }}>
          <div style={sectionLabelStyle}>Code changes</div>
          <div style={{
            fontSize: 24,
            fontWeight: 600,
            color: '#5243AA',
            lineHeight: 1,
            marginBottom: 4,
          }}>
            {release.metrics?.code_changes_count || 0}
          </div>
          <div style={{
            fontSize: 12,
            color: '#6B778C',
          }}>
            commits included
          </div>
        </div>

        {/* Ticket Completion */}
        <div style={{
          padding: 16,
          backgroundColor: '#FFFFFF',
          border: '1px solid #DFE1E6',
          borderRadius: 3,
        }}>
          <div style={sectionLabelStyle}>Ticket completion</div>
          <div style={{
            fontSize: 24,
            fontWeight: 600,
            color: '#0052CC',
            lineHeight: 1,
            marginBottom: 4,
          }}>
            {release.metrics?.tickets_total
              ? `${Math.round((release.metrics.tickets_completed / release.metrics.tickets_total) * 100)}%`
              : '—'}
          </div>
          <div style={{
            fontSize: 12,
            color: '#6B778C',
          }}>
            {release.metrics?.tickets_completed || 0} of {release.metrics?.tickets_total || 0} tickets completed
          </div>
        </div>
      </div>

      {/* Additional Info */}
      {release.first_commit_date && (
        <div style={{
          marginTop: 16,
          padding: 16,
          backgroundColor: '#FAFBFC',
          border: '1px solid #DFE1E6',
          borderRadius: 3,
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
          }}>
            <div>
              <div style={sectionLabelStyle}>First commit</div>
              <div style={{
                fontSize: 14,
                fontWeight: 500,
                color: '#172B4D',
              }}>
                {new Date(release.first_commit_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
            {release.release_completed_date && (
              <div>
                <div style={sectionLabelStyle}>Release date</div>
                <div style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: '#172B4D',
                }}>
                  {new Date(release.release_completed_date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
