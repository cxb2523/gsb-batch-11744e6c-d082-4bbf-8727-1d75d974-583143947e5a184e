'use client';

import React from 'react';
import TicketDetailModal from '@/components/TicketDetailModal';
import CreateIssueModal from '@/components/CreateIssueModal';
import { ButtonCore } from '@/components/ui';
import {
  AlertCircle,
  Clock,
  PauseCircle,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Target,
  Layers,
  Package,
  Flame,
  Plus,
} from 'lucide-react';
import { C, CARD } from './constants';
import { formatLongDate } from './helpers';
import { useDashboard } from './useDashboard';
import { SectionCard, SubGroup, StatChip, StatRow } from './primitives';
import { TicketRow } from './TicketRow';
import { SprintRow } from './SprintRow';
import { EpicRow } from './EpicRow';
import { ReleaseRow } from './ReleaseRow';
import { ActivityRowView } from './ActivityRowView';

export default function DashboardPage() {
  const {
    loading,
    summary,
    selected,
    setSelected,
    showCreate,
    setShowCreate,
    createProjectId,
    sectionRefs,
    fetchSummary,
    handleOpenTicket,
    handleOpenCreate,
    scrollToSection,
    navigate,
    todayDate,
    greeting,
    firstName,
  } = useDashboard();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: 'var(--font-sans)' }}>
        <div style={{ ...CARD, borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none', padding: '16px 24px' }}>
          <div style={{ height: 20, width: 280, background: C.borderSubtle, borderRadius: 3 }} />
          <div style={{ marginTop: 8, height: 14, width: 360, background: C.borderSubtle, borderRadius: 3 }} />
        </div>
        <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ ...CARD, marginBottom: 16, padding: 16 }}>
              <div style={{ height: 16, width: 220, background: C.borderSubtle, borderRadius: 3, marginBottom: 12 }} />
              <div style={{ height: 12, width: '100%', background: C.borderSubtle, borderRadius: 3, marginBottom: 8 }} />
              <div style={{ height: 12, width: '85%', background: C.borderSubtle, borderRadius: 3 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div style={{ minHeight: '100vh', background: C.pageBg, fontFamily: 'var(--font-sans)', padding: 24 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', ...CARD, padding: 24 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: C.heading }}>
            Couldn&apos;t load dashboard
          </h1>
          <p style={{ marginTop: 8, fontSize: 13, color: C.subtle }}>
            Something went wrong fetching your status. Try refreshing the page.
          </p>
          <ButtonCore
            variant="primary"
            onClick={fetchSummary}
            style={{ marginTop: 16 }}
          >
            Retry
          </ButtonCore>
        </div>
      </div>
    );
  }

  const { counts } = summary;
  const hasUrgent = counts.overdue + counts.due_today + counts.blocked + counts.urgent_open > 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.pageBg,
        fontFamily: 'var(--font-sans)',
        color: C.heading,
      }}
    >
      {/* Header bar */}
      <div
        style={{
          background: C.cardBg,
          borderBottom: `1px solid ${C.border}`,
          padding: '16px 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 600,
                color: C.heading,
                lineHeight: 1.2,
              }}
            >
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: C.subtle }}>
              {formatLongDate(todayDate)}
            </p>
          </div>
          <ButtonCore
            variant="primary"
            onClick={handleOpenCreate}
            leftIcon={<Plus size={16} />}
          >
            Create issue
          </ButtonCore>
        </div>

        {/* Stat strip */}
        <div
          style={{
            maxWidth: 1280,
            margin: '12px auto 0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0,
            fontSize: 13,
          }}
        >
          <StatChip
            icon={<AlertCircle size={14} />}
            label="overdue"
            value={counts.overdue}
            valueColor={counts.overdue > 0 ? C.danger : C.muted}
            onClick={() => scrollToSection('needs-attention')}
          />
          <StatChip
            icon={<Clock size={14} />}
            label="due today"
            value={counts.due_today}
            valueColor={counts.due_today > 0 ? C.warning : C.muted}
            onClick={() => scrollToSection('needs-attention')}
          />
          <StatChip
            icon={<PauseCircle size={14} />}
            label="blocked"
            value={counts.blocked}
            valueColor={counts.blocked > 0 ? C.danger : C.muted}
            onClick={() => scrollToSection('needs-attention')}
          />
          <StatChip
            icon={<Flame size={14} />}
            label="urgent"
            value={counts.urgent_open}
            valueColor={counts.urgent_open > 0 ? C.danger : C.muted}
            onClick={() => scrollToSection('needs-attention')}
          />
          <StatChip
            icon={<Activity size={14} />}
            label="in progress"
            value={counts.in_progress}
            valueColor={C.inProgress}
            onClick={() => scrollToSection('in-progress')}
          />
          <StatChip
            icon={<AlertTriangle size={14} />}
            label="at risk"
            value={counts.at_risk}
            valueColor={counts.at_risk > 0 ? C.warning : C.muted}
            onClick={() => scrollToSection('at-risk')}
          />
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 320px',
            gap: 24,
            alignItems: 'flex-start',
          }}
        >
          {/* MAIN COLUMN */}
          <div style={{ minWidth: 0 }}>
            {/* Needs attention */}
            <div ref={(el) => { sectionRefs.current['needs-attention'] = el; }}>
              <SectionCard
                icon={<AlertCircle size={16} />}
                title="Needs attention"
                accent={hasUrgent ? C.danger : C.muted}
                count={counts.overdue + counts.due_today + counts.blocked + counts.urgent_open}
                empty="Nothing on fire. Nice work."
              >
                {summary.overdue.length > 0 && (
                  <SubGroup label="Overdue" accent={C.danger} count={summary.overdue.length}>
                    {summary.overdue.map((t) => (
                      <TicketRow
                        key={`o-${t.id}`}
                        ticket={t}
                        onClick={() => handleOpenTicket(t)}
                        highlightDue="overdue"
                      />
                    ))}
                  </SubGroup>
                )}
                {summary.due_today.length > 0 && (
                  <SubGroup label="Due today" accent={C.warning} count={summary.due_today.length}>
                    {summary.due_today.map((t) => (
                      <TicketRow
                        key={`d-${t.id}`}
                        ticket={t}
                        onClick={() => handleOpenTicket(t)}
                        highlightDue="today"
                      />
                    ))}
                  </SubGroup>
                )}
                {summary.blocked.length > 0 && (
                  <SubGroup label="Blocked" accent={C.danger} count={summary.blocked.length}>
                    {summary.blocked.map((t) => (
                      <TicketRow key={`b-${t.id}`} ticket={t} onClick={() => handleOpenTicket(t)} />
                    ))}
                  </SubGroup>
                )}
                {summary.urgent_open.length > 0 && (
                  <SubGroup label="Urgent — open" accent={C.danger} count={summary.urgent_open.length}>
                    {summary.urgent_open.map((t) => (
                      <TicketRow key={`u-${t.id}`} ticket={t} onClick={() => handleOpenTicket(t)} />
                    ))}
                  </SubGroup>
                )}
              </SectionCard>
            </div>

            {/* In progress */}
            <div ref={(el) => { sectionRefs.current['in-progress'] = el; }}>
              <SectionCard
                icon={<Activity size={16} />}
                title="In progress"
                accent={C.inProgress}
                count={summary.in_progress.length}
                empty="You have nothing in progress right now."
              >
                {summary.in_progress.map((t) => (
                  <TicketRow
                    key={`p-${t.id}`}
                    ticket={t}
                    onClick={() => handleOpenTicket(t)}
                  />
                ))}
              </SectionCard>
            </div>

            {/* At risk */}
            <div ref={(el) => { sectionRefs.current['at-risk'] = el; }}>
              <SectionCard
                icon={<AlertTriangle size={16} />}
                title="At risk"
                accent={C.warning}
                count={summary.at_risk.length}
                empty="Nothing slipping. Keep it up."
              >
                {summary.at_risk.map((t) => (
                  <TicketRow
                    key={`r-${t.id}`}
                    ticket={t}
                    onClick={() => handleOpenTicket(t)}
                    highlightDue="soon"
                  />
                ))}
              </SectionCard>
            </div>

            {/* Active sprints */}
            <div ref={(el) => { sectionRefs.current['sprints'] = el; }}>
              <SectionCard
                icon={<Target size={16} />}
                title="Active sprints I'm on"
                accent={C.inProgress}
                count={summary.active_sprints.length}
                empty="No active sprints with your work."
              >
                {summary.active_sprints.map((s) => (
                  <SprintRow
                    key={`s-${s.project_id}-${s.id}`}
                    sprint={s}
                    onClick={() => navigate(`/projects/${s.project_id}/sprint?sprint=${s.id}`)}
                  />
                ))}
              </SectionCard>
            </div>

            {/* My epics */}
            {summary.my_epics.length > 0 && (
              <div ref={(el) => { sectionRefs.current['epics'] = el; }}>
                <SectionCard
                  icon={<Layers size={16} />}
                  title="My epics"
                  count={summary.my_epics.length}
                >
                  {summary.my_epics.map((e) => (
                    <EpicRow
                      key={`e-${e.project_id}-${e.id}`}
                      epic={e}
                      onClick={() => navigate(`/projects/${e.project_id}/epics`)}
                    />
                  ))}
                </SectionCard>
              </div>
            )}

            {/* Recent activity */}
            {summary.recent_activity.length > 0 && (
              <SectionCard
                icon={<Activity size={16} />}
                title="Recent activity"
                count={summary.recent_activity.length}
              >
                {summary.recent_activity.map((a) => (
                  <ActivityRowView
                    key={`a-${a.id}-${a.timestamp}`}
                    activity={a}
                    onClick={() => setSelected({ id: a.id, projectId: a.project_id })}
                  />
                ))}
              </SectionCard>
            )}
          </div>

          {/* SIDEBAR */}
          <aside style={{ minWidth: 0 }}>
            {/* Quick stats */}
            <SectionCard icon={<CheckCircle2 size={16} />} title="This week" accent={C.success}>
              <StatRow label="Completed" value={summary.quick_stats.completed_this_week} color={C.success} />
              <StatRow label="Created" value={summary.quick_stats.created_this_week} color={C.inProgress} />
              <StatRow
                label="Hours logged"
                value={`${summary.quick_stats.hours_logged_this_week}h`}
                color={C.heading}
                last
              />
            </SectionCard>

            {/* Upcoming releases */}
            {summary.upcoming_releases.length > 0 && (
              <SectionCard
                icon={<Package size={16} />}
                title="Upcoming releases"
                count={summary.upcoming_releases.length}
              >
                {summary.upcoming_releases.map((r) => (
                  <ReleaseRow
                    key={`rel-${r.project_id}-${r.id}`}
                    release={r}
                    onClick={() => navigate(`/projects/${r.project_id}/releases`)}
                  />
                ))}
              </SectionCard>
            )}
          </aside>
        </div>
      </div>

      {/* Modals */}
      {selected && (
        <TicketDetailModal
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          projectId={selected.projectId}
          ticketId={selected.id}
          onTicketUpdated={fetchSummary}
        />
      )}
      {showCreate && createProjectId && (
        <CreateIssueModal
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          projectId={createProjectId}
          onIssueCreated={fetchSummary}
        />
      )}
    </div>
  );
}
