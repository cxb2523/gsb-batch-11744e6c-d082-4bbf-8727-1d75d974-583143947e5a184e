'use client';

import React, { useState, useEffect } from 'react';
import { statusReportsApi, ComprehensiveStatusReport } from '@/lib/api/status-reports';
import { tokens } from '@/design-system/tokens';
import {
  BarChart, TrendingUp, TrendingDown, Users, Activity,
  CheckCircle, AlertCircle, Clock, ArrowRight, RefreshCw,
  User, Hash, Filter
} from 'lucide-react';

interface ComprehensiveStatusReportProps {
  projectId: number;
}

export const ComprehensiveStatusReportComponent: React.FC<ComprehensiveStatusReportProps> = ({ projectId }) => {
  const [report, setReport] = useState<ComprehensiveStatusReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'daily' | 'weekly'>('weekly');
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  useEffect(() => {
    loadReport();
  }, [projectId, period]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await statusReportsApi.getComprehensiveReport(projectId, period);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: tokens.spacing[8], textAlign: 'center' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <p>Loading comprehensive report...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: tokens.spacing[8], color: tokens.colors.error[600] }}>
        <AlertCircle size={24} />
        <p>{error}</p>
      </div>
    );
  }

  if (!report) return null;

  const getStatusColor = (status: string) => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus === 'done' || lowerStatus === 'closed' || lowerStatus === 'completed') {
      return tokens.colors.success[500];
    }
    if (lowerStatus === 'in-progress' || lowerStatus === 'in progress') {
      return tokens.colors.warning[500];
    }
    if (lowerStatus === 'blocked') {
      return tokens.colors.error[500];
    }
    return tokens.colors.neutral[400];
  };

  return (
    <div style={{ padding: tokens.spacing[6] }}>
      {/* Header with Period Toggle */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: tokens.spacing[6],
      }}>
        <h2 style={{
          fontSize: tokens.typography.sizes.xl,
          fontWeight: tokens.typography.weights.bold,
          color: tokens.colors.semantic.text.primary,
        }}>
          Comprehensive Status Report
        </h2>
        <div style={{ display: 'flex', gap: tokens.spacing[2] }}>
          <button
            onClick={() => setPeriod('daily')}
            style={{
              padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
              backgroundColor: period === 'daily' ? tokens.colors.primary[500] : tokens.colors.neutral[100],
              color: period === 'daily' ? 'white' : tokens.colors.semantic.text.primary,
              border: 'none',
              borderRadius: tokens.borderRadius.md,
              cursor: 'pointer',
            }}
          >
            Daily
          </button>
          <button
            onClick={() => setPeriod('weekly')}
            style={{
              padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
              backgroundColor: period === 'weekly' ? tokens.colors.primary[500] : tokens.colors.neutral[100],
              color: period === 'weekly' ? 'white' : tokens.colors.semantic.text.primary,
              border: 'none',
              borderRadius: tokens.borderRadius.md,
              cursor: 'pointer',
            }}
          >
            Weekly
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: tokens.spacing[4],
        marginBottom: tokens.spacing[6],
      }}>
        <div style={{
          padding: tokens.spacing[4],
          backgroundColor: tokens.colors.semantic.background.default,
          borderRadius: tokens.borderRadius.lg,
          border: `1px solid ${tokens.colors.neutral[200]}`,
        }}>
          <div style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.secondary }}>
            Total Tickets
          </div>
          <div style={{ fontSize: tokens.typography.sizes['5xl'], fontWeight: tokens.typography.weights.bold }}>
            {report.summary.total_tickets}
          </div>
        </div>

        <div style={{
          padding: tokens.spacing[4],
          backgroundColor: tokens.colors.success[50],
          borderRadius: tokens.borderRadius.lg,
          border: `1px solid ${tokens.colors.success[200]}`,
        }}>
          <div style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.success[700] }}>
            Done
          </div>
          <div style={{ fontSize: tokens.typography.sizes['5xl'], fontWeight: tokens.typography.weights.bold, color: tokens.colors.success[600] }}>
            {report.summary.done_tickets}
          </div>
        </div>

        <div style={{
          padding: tokens.spacing[4],
          backgroundColor: tokens.colors.warning[50],
          borderRadius: tokens.borderRadius.lg,
          border: `1px solid ${tokens.colors.warning[200]}`,
        }}>
          <div style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.warning[700] }}>
            In Progress
          </div>
          <div style={{ fontSize: tokens.typography.sizes['5xl'], fontWeight: tokens.typography.weights.bold, color: tokens.colors.warning[600] }}>
            {report.summary.in_progress_tickets}
          </div>
        </div>

        <div style={{
          padding: tokens.spacing[4],
          backgroundColor: tokens.colors.error[50],
          borderRadius: tokens.borderRadius.lg,
          border: `1px solid ${tokens.colors.error[200]}`,
        }}>
          <div style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.error[700] }}>
            Blocked
          </div>
          <div style={{ fontSize: tokens.typography.sizes['5xl'], fontWeight: tokens.typography.weights.bold, color: tokens.colors.error[600] }}>
            {report.summary.blocked_tickets}
          </div>
        </div>

        <div style={{
          padding: tokens.spacing[4],
          backgroundColor: tokens.colors.neutral[50],
          borderRadius: tokens.borderRadius.lg,
          border: `1px solid ${tokens.colors.neutral[200]}`,
        }}>
          <div style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.secondary }}>
            Unassigned
          </div>
          <div style={{ fontSize: tokens.typography.sizes['5xl'], fontWeight: tokens.typography.weights.bold }}>
            {report.summary.unassigned_tickets}
          </div>
        </div>
      </div>

      {/* Status Distribution */}
      <div style={{
        backgroundColor: tokens.colors.semantic.background.default,
        borderRadius: tokens.borderRadius.lg,
        padding: tokens.spacing[6],
        marginBottom: tokens.spacing[6],
      }}>
        <h3 style={{
          fontSize: tokens.typography.sizes.lg,
          fontWeight: tokens.typography.weights.semibold,
          marginBottom: tokens.spacing[4],
        }}>
          Status Distribution
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: tokens.spacing[3],
        }}>
          {Object.entries(report.status_distribution).map(([status, data]) => (
            <div
              key={status}
              onClick={() => setSelectedStatus(selectedStatus === status ? null : status)}
              style={{
                padding: tokens.spacing[4],
                backgroundColor: tokens.colors.neutral[50],
                borderRadius: tokens.borderRadius.md,
                border: `2px solid ${selectedStatus === status ? getStatusColor(status) : tokens.colors.neutral[200]}`,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: tokens.spacing[2],
              }}>
                <span style={{
                  fontSize: tokens.typography.sizes.md,
                  fontWeight: tokens.typography.weights.semibold,
                  color: getStatusColor(status),
                }}>
                  {status}
                </span>
                <span style={{
                  fontSize: tokens.typography.sizes.xl,
                  fontWeight: tokens.typography.weights.bold,
                }}>
                  {data.count}
                </span>
              </div>

              <div style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.secondary }}>
                <div>Avg Age: {data.average_age_days} days</div>
                <div style={{ marginTop: tokens.spacing[1] }}>
                  Assignees: {Object.keys(data.by_assignee).length}
                </div>
              </div>

              {selectedStatus === status && (
                <div style={{
                  marginTop: tokens.spacing[3],
                  paddingTop: tokens.spacing[3],
                  borderTop: `1px solid ${tokens.colors.neutral[200]}`,
                }}>
                  <div style={{ fontSize: tokens.typography.sizes.xs }}>
                    <strong>By Type:</strong>
                    <div>
                      {Object.entries(data.by_type).map(([type, count]) => (
                        <div key={type}>{type}: {count}</div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: tokens.spacing[2], fontSize: tokens.typography.sizes.xs }}>
                    <strong>By Priority:</strong>
                    <div>
                      {Object.entries(data.by_priority).map(([priority, count]) => (
                        <div key={priority}>{priority}: {count}</div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: tokens.spacing[2], fontSize: tokens.typography.sizes.xs }}>
                    <strong>Recent Tickets:</strong>
                    {data.tickets.slice(0, 3).map(ticket => (
                      <div key={ticket.id} style={{ marginTop: tokens.spacing[1] }}>
                        {ticket.key}: {ticket.title}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Velocity Metrics */}
      <div style={{
        backgroundColor: tokens.colors.semantic.background.default,
        borderRadius: tokens.borderRadius.lg,
        padding: tokens.spacing[6],
        marginBottom: tokens.spacing[6],
      }}>
        <h3 style={{
          fontSize: tokens.typography.sizes.lg,
          fontWeight: tokens.typography.weights.semibold,
          marginBottom: tokens.spacing[4],
        }}>
          Velocity Metrics
        </h3>

        <div style={{ display: 'flex', gap: tokens.spacing[6], alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.secondary }}>
              Current Period
            </div>
            <div style={{ fontSize: tokens.typography.sizes['5xl'], fontWeight: tokens.typography.weights.bold }}>
              {report.velocity_metrics.current_period_velocity}%
            </div>
          </div>

          <div>
            <div style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.secondary }}>
              Average
            </div>
            <div style={{ fontSize: tokens.typography.sizes['5xl'], fontWeight: tokens.typography.weights.bold }}>
              {report.velocity_metrics.average_velocity}%
            </div>
          </div>

          <div>
            <div style={{ fontSize: tokens.typography.sizes.sm, color: tokens.colors.semantic.text.secondary }}>
              Trend
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: tokens.spacing[2],
              fontSize: tokens.typography.sizes.lg,
              fontWeight: tokens.typography.weights.semibold,
              color: report.velocity_metrics.trend === 'improving' ? tokens.colors.success[600] :
                     report.velocity_metrics.trend === 'declining' ? tokens.colors.error[600] :
                     tokens.colors.neutral[600],
            }}>
              {report.velocity_metrics.trend === 'improving' ? <TrendingUp size={20} /> :
               report.velocity_metrics.trend === 'declining' ? <TrendingDown size={20} /> :
               <Activity size={20} />}
              {report.velocity_metrics.trend}
            </div>
          </div>
        </div>
      </div>

      {/* Assignee Metrics */}
      <div style={{
        backgroundColor: tokens.colors.semantic.background.default,
        borderRadius: tokens.borderRadius.lg,
        padding: tokens.spacing[6],
        marginBottom: tokens.spacing[6],
      }}>
        <h3 style={{
          fontSize: tokens.typography.sizes.lg,
          fontWeight: tokens.typography.weights.semibold,
          marginBottom: tokens.spacing[4],
        }}>
          Assignee Metrics
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${tokens.colors.neutral[200]}` }}>
                <th style={{ padding: tokens.spacing[2], textAlign: 'left' }}>Assignee</th>
                <th style={{ padding: tokens.spacing[2], textAlign: 'center' }}>Total</th>
                <th style={{ padding: tokens.spacing[2], textAlign: 'center' }}>Done</th>
                <th style={{ padding: tokens.spacing[2], textAlign: 'center' }}>In Progress</th>
                <th style={{ padding: tokens.spacing[2], textAlign: 'center' }}>Blocked</th>
                <th style={{ padding: tokens.spacing[2], textAlign: 'left' }}>Status Distribution</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.assignee_metrics).map(([name, metrics]) => (
                <tr key={name} style={{ borderBottom: `1px solid ${tokens.colors.neutral[100]}` }}>
                  <td style={{ padding: tokens.spacing[2] }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2] }}>
                      <User size={16} />
                      {name}
                    </div>
                  </td>
                  <td style={{ padding: tokens.spacing[2], textAlign: 'center', fontWeight: tokens.typography.weights.semibold }}>
                    {metrics.total_assigned}
                  </td>
                  <td style={{ padding: tokens.spacing[2], textAlign: 'center', color: tokens.colors.success[600] }}>
                    {metrics.completed}
                  </td>
                  <td style={{ padding: tokens.spacing[2], textAlign: 'center', color: tokens.colors.warning[600] }}>
                    {metrics.in_progress}
                  </td>
                  <td style={{ padding: tokens.spacing[2], textAlign: 'center', color: tokens.colors.error[600] }}>
                    {metrics.blocked}
                  </td>
                  <td style={{ padding: tokens.spacing[2] }}>
                    <div style={{ display: 'flex', gap: tokens.spacing[1], flexWrap: 'wrap' }}>
                      {Object.entries(metrics.by_status).slice(0, 3).map(([status, count]) => (
                        <span
                          key={status}
                          style={{
                            padding: `${tokens.spacing[1]} ${tokens.spacing[2]}`,
                            backgroundColor: tokens.colors.neutral[100],
                            borderRadius: tokens.borderRadius.sm,
                            fontSize: tokens.typography.sizes.xs,
                          }}
                        >
                          {status}: {count}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transition Metrics */}
      <div style={{
        backgroundColor: tokens.colors.semantic.background.default,
        borderRadius: tokens.borderRadius.lg,
        padding: tokens.spacing[6],
      }}>
        <h3 style={{
          fontSize: tokens.typography.sizes.lg,
          fontWeight: tokens.typography.weights.semibold,
          marginBottom: tokens.spacing[4],
        }}>
          Transition Metrics
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: tokens.spacing[6] }}>
          {/* Most Common Transitions */}
          <div>
            <h4 style={{
              fontSize: tokens.typography.sizes.md,
              fontWeight: tokens.typography.weights.medium,
              marginBottom: tokens.spacing[3],
            }}>
              Most Common Transitions
            </h4>
            {report.transition_metrics.most_common_transitions.map((transition, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: tokens.spacing[3],
                  padding: tokens.spacing[2],
                  backgroundColor: tokens.colors.neutral[50],
                  borderRadius: tokens.borderRadius.md,
                  marginBottom: tokens.spacing[2],
                }}
              >
                <span style={{
                  padding: `${tokens.spacing[1]} ${tokens.spacing[2]}`,
                  backgroundColor: getStatusColor(transition.from),
                  color: 'white',
                  borderRadius: tokens.borderRadius.sm,
                  fontSize: tokens.typography.sizes.sm,
                }}>
                  {transition.from}
                </span>
                <ArrowRight size={16} />
                <span style={{
                  padding: `${tokens.spacing[1]} ${tokens.spacing[2]}`,
                  backgroundColor: getStatusColor(transition.to),
                  color: 'white',
                  borderRadius: tokens.borderRadius.sm,
                  fontSize: tokens.typography.sizes.sm,
                }}>
                  {transition.to}
                </span>
                <span style={{
                  marginLeft: 'auto',
                  fontWeight: tokens.typography.weights.semibold,
                }}>
                  {transition.count}
                </span>
              </div>
            ))}
          </div>

          {/* Bottleneck Statuses */}
          <div>
            <h4 style={{
              fontSize: tokens.typography.sizes.md,
              fontWeight: tokens.typography.weights.medium,
              marginBottom: tokens.spacing[3],
            }}>
              Bottleneck Statuses
            </h4>
            {report.transition_metrics.bottleneck_statuses.length === 0 ? (
              <div style={{
                padding: tokens.spacing[4],
                backgroundColor: tokens.colors.success[50],
                borderRadius: tokens.borderRadius.md,
                textAlign: 'center',
                color: tokens.colors.success[700],
              }}>
                <CheckCircle size={24} style={{ marginBottom: tokens.spacing[2] }} />
                <div>No bottlenecks detected!</div>
              </div>
            ) : (
              report.transition_metrics.bottleneck_statuses.map((bottleneck, index) => (
                <div
                  key={index}
                  style={{
                    padding: tokens.spacing[3],
                    backgroundColor: tokens.colors.error[50],
                    borderRadius: tokens.borderRadius.md,
                    marginBottom: tokens.spacing[2],
                  }}
                >
                  <div style={{
                    fontSize: tokens.typography.sizes.md,
                    fontWeight: tokens.typography.weights.semibold,
                    color: tokens.colors.error[700],
                  }}>
                    {bottleneck.status}
                  </div>
                  <div style={{
                    fontSize: tokens.typography.sizes.sm,
                    color: tokens.colors.error[600],
                    marginTop: tokens.spacing[1],
                  }}>
                    {bottleneck.ticket_count} tickets stuck
                    ({bottleneck.transitions_out} transitions out)
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};