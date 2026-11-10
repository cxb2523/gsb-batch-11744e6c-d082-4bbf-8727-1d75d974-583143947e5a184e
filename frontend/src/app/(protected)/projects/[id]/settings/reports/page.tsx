'use client';

import React, { useState, useEffect } from 'react';
import { ButtonCore } from '@/components/ui';
import {
  RefreshCw,
  Layers,
  CircleDot,
  CircleCheck,
  TriangleAlert,
  CalendarPlus,
  CalendarCheck,
  CalendarRange,
  UserMinus,
  CircleAlert,
} from 'lucide-react';
import { useProjectIdParam } from '../../../../../../hooks/useProjectContext';
import { tokens } from '../../../../../../design-system/tokens';
import { StatCard, surface, Tone } from '../../../../../../components/reports/ReportLayout';
import { reportsAPI, ProjectReport } from '../../../../../../lib/api/integrations';

export default function ReportsSettings() {
  const projectId = useProjectIdParam();
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Fetch report when project ID is available
  useEffect(() => {
    if (projectId) {
      fetchReport();
    }
  }, [projectId]);

  const fetchReport = async () => {
    if (!projectId) return;
    setReportLoading(true);
    setReportError(null);
    try {
      const data = await reportsAPI.getReport(projectId);
      setReport(data);
    } catch (e: any) {
      setReportError(e.message || 'Failed to fetch report');
    } finally {
      setReportLoading(false);
    }
  };

  if (!projectId) {
    return (
      <div style={{ fontFamily: tokens.fontFamily.sans, fontSize: 14, color: tokens.colors.neutral[600] }}>
        Please select a project first.
      </div>
    );
  }

  // Both rows are the same card; the first four carry a status colour, the rest
  // are plain counts.
  const summaryCards: { icon: any; label: string; value: number; tone: Tone }[] = report
    ? [
        { icon: Layers, label: 'Total Tickets', value: report.summary.total_tickets, tone: 'neutral' },
        { icon: CircleDot, label: 'Open', value: report.summary.open, tone: 'primary' },
        { icon: CircleCheck, label: 'Closed', value: report.summary.closed, tone: 'success' },
        {
          icon: TriangleAlert,
          label: 'Overdue',
          value: report.summary.overdue,
          tone: report.summary.overdue > 0 ? 'danger' : 'neutral',
        },
        { icon: CalendarPlus, label: 'Created This Week', value: report.summary.created_this_week, tone: 'neutral' },
        { icon: CalendarCheck, label: 'Closed This Week', value: report.summary.closed_this_week, tone: 'neutral' },
        { icon: CalendarRange, label: 'Created This Month', value: report.summary.created_this_month, tone: 'neutral' },
        { icon: UserMinus, label: 'Unassigned', value: report.summary.unassigned, tone: 'neutral' },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: tokens.fontFamily.sans }}>
      {/* Header row with refresh */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: tokens.colors.neutral[900] }}>
            Performance Report
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: tokens.colors.neutral[600] }}>
            {report
              ? `Generated ${new Date(report.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
              : 'Loading...'}
          </p>
        </div>
        <ButtonCore
          variant="primary"
          onClick={fetchReport}
          disabled={reportLoading}
          leftIcon={
            <RefreshCw
              size={14}
              style={reportLoading ? { animation: 'settings-report-spin 0.8s linear infinite' } : undefined}
            />
          }
        >
          {reportLoading ? 'Refreshing...' : 'Refresh'}
        </ButtonCore>
      </div>

      {reportError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: tokens.colors.error[50],
            border: `1px solid ${tokens.colors.error[200]}`,
            borderRadius: 8,
            padding: '10px 14px',
          }}
        >
          <CircleAlert size={15} color={tokens.colors.error[600]} />
          <p style={{ margin: 0, fontSize: 13, color: tokens.colors.error[700] }}>{reportError}</p>
        </div>
      )}

      {reportLoading && !report && (
        <div style={{ ...surface, padding: 48, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: tokens.colors.neutral[600] }}>Generating report...</p>
        </div>
      )}

      {report && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {summaryCards.map((card) => (
              <StatCard key={card.label} icon={card.icon} label={card.label} value={card.value} tone={card.tone} />
            ))}
          </div>

          {/* Velocity + Status Distribution side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Velocity */}
            <div style={{ ...surface, padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: tokens.colors.neutral[900] }}>
                Velocity (tickets closed / week)
              </h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 130 }}>
                {report.velocity.map((week, i) => {
                  const maxClosed = Math.max(...report.velocity.map((w) => w.closed), 1);
                  const barHeight = (week.closed / maxClosed) * 100;
                  return (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        height: '100%',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: tokens.colors.neutral[900] }}>
                        {week.closed}
                      </span>
                      <div
                        style={{
                          width: '100%',
                          height: `${barHeight}%`,
                          minHeight: week.closed > 0 ? 6 : 2,
                          background: week.closed > 0 ? tokens.colors.primary[500] : tokens.colors.neutral[200],
                          borderRadius: '4px 4px 0 0',
                        }}
                      />
                      <span style={{ fontSize: 11, color: tokens.colors.neutral[600], textAlign: 'center' }}>
                        {week.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Status Distribution */}
            <div style={{ ...surface, padding: 20 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: tokens.colors.neutral[900] }}>
                Status Distribution
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Object.entries(report.status_distribution).map(([status, count]) => {
                  const total = report.summary.total_tickets || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={status}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: tokens.colors.neutral[800] }}>{status}</span>
                        <span style={{ fontSize: 13, fontWeight: 500, color: tokens.colors.neutral[600] }}>
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div style={{ height: 6, background: tokens.colors.neutral[200], borderRadius: 3 }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: tokens.colors.primary[500],
                            borderRadius: 3,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Assignee Stats Table */}
          <div style={{ ...surface, padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: tokens.colors.neutral[900] }}>
              Assignee Breakdown
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${tokens.colors.neutral[200]}` }}>
                    {['Assignee', 'Open', 'Closed', 'Total'].map((h, i) => (
                      <th
                        key={h}
                        style={{
                          textAlign: i === 0 ? 'left' : 'right',
                          padding: '8px 12px',
                          fontSize: 11,
                          fontWeight: 600,
                          color: tokens.colors.neutral[600],
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.assignee_stats).map(([name, stats]) => (
                    <tr key={name} style={{ borderBottom: `1px solid ${tokens.colors.neutral[200]}` }}>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: tokens.colors.neutral[900] }}>{name}</td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontSize: 13,
                          textAlign: 'right',
                          color: tokens.colors.primary[500],
                          fontWeight: 500,
                        }}
                      >
                        {stats.open}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontSize: 13,
                          textAlign: 'right',
                          color: tokens.colors.success[600],
                          fontWeight: 500,
                        }}
                      >
                        {stats.closed}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          fontSize: 13,
                          textAlign: 'right',
                          color: tokens.colors.neutral[900],
                          fontWeight: 600,
                        }}
                      >
                        {stats.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <style jsx global>{`
        @keyframes settings-report-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
