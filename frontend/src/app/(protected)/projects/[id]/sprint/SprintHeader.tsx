import React from 'react';
import { ChevronDown, Calendar, Pencil } from 'lucide-react';
import { tokens } from '../../../../../design-system/tokens';
import { Sprint, SprintCapacity } from '../../../../../lib/api/sprints';
import { COLORS } from './constants';
import { getDaysRemaining, formatDaysRemaining } from './helpers';

// Sprint Header Component
export const SprintHeader: React.FC<{
  sprint: Sprint | null;
  activeSprints: Sprint[];
  onSwitchSprint: (sprintId: number) => void;
  capacity: SprintCapacity | null;
  projectId: number;
  onCompleteSprint: () => void;
  onSprintGoalUpdate: (goal: string) => Promise<void>;
  canEditDates: boolean;
  onEditEndDate: () => void;
}> = ({ sprint, activeSprints, onSwitchSprint, capacity, projectId, onCompleteSprint, onSprintGoalUpdate, canEditDates, onEditEndDate }) => {
  const [editingGoal, setEditingGoal] = React.useState(false);
  const [goalDraft, setGoalDraft] = React.useState(sprint?.goal || '');
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const switcherRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setGoalDraft(sprint?.goal || '');
  }, [sprint?.goal]);

  React.useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const saveGoal = async () => {
    const trimmed = goalDraft.trim();
    if (trimmed === (sprint?.goal || '')) {
      setEditingGoal(false);
      return;
    }
    await onSprintGoalUpdate(trimmed);
    setEditingGoal(false);
  };
  if (!sprint) {
    return (
      <div style={{ padding: 24, background: COLORS.cardBg, borderBottom: `2px solid ${COLORS.borderLight}` }}>
        <div style={{ color: COLORS.textSecondary, fontSize: 15 }}>No active sprint</div>
      </div>
    );
  }

  const daysLeft = getDaysRemaining(sprint.end_date);
  const progressPercentage = capacity?.progress_percentage || 0;

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: tokens.zIndex.sticky,
        background: COLORS.cardBg,
        borderBottom: `2px solid ${COLORS.borderLight}`,
        padding: '20px 32px',
        fontFamily: tokens.fontFamily.sans,
      }}
    >
      {/* Sprint Name & Goal */}
      <div style={{ marginBottom: 16 }}>
        {activeSprints.length > 1 ? (
          <div ref={switcherRef} style={{ position: 'relative', marginBottom: 4 }}>
            <button
              onClick={() => setSwitcherOpen((o) => !o)}
              aria-label="Switch active sprint"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                maxWidth: 520,
                padding: '4px 8px',
                background: switcherOpen ? COLORS.background : 'transparent',
                border: '1px solid transparent',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: tokens.fontFamily.sans,
                transition: 'background 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => { if (!switcherOpen) e.currentTarget.style.background = COLORS.background; }}
              onMouseLeave={(e) => { if (!switcherOpen) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{
                fontSize: 18,
                fontWeight: 600,
                color: COLORS.textPrimary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {sprint.name}
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: COLORS.textSecondary,
                background: COLORS.borderLight,
                borderRadius: 10,
                padding: '1px 7px',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {activeSprints.length} active
              </span>
              <ChevronDown size={16} color={COLORS.textSecondary} style={{ flexShrink: 0 }} />
            </button>

            {switcherOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                width: 300,
                maxHeight: 360,
                background: COLORS.cardBg,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 3,
                boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                overflow: 'auto',
                zIndex: tokens.zIndex.dropdown,
                padding: '4px 0',
              }}>
                {activeSprints.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { onSwitchSprint(s.id); setSwitcherOpen(false); }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: s.id === sprint.id ? '#DEEBFF' : 'transparent',
                      border: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 2,
                      cursor: 'pointer',
                      fontFamily: tokens.fontFamily.sans,
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { if (s.id !== sprint.id) e.currentTarget.style.background = COLORS.background; }}
                    onMouseLeave={(e) => { if (s.id !== sprint.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.textPrimary }}>{s.name}</span>
                    {s.goal && (
                      <span style={{
                        fontSize: 12,
                        color: COLORS.textSecondary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                      }}>
                        {s.goal}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 600,
              color: COLORS.textPrimary,
              marginBottom: 4,
            }}
          >
            {sprint.name}
          </h1>
        )}
        {editingGoal ? (
          <textarea
            value={goalDraft}
            onChange={(e) => setGoalDraft(e.target.value)}
            onBlur={saveGoal}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                saveGoal();
              } else if (e.key === 'Escape') {
                setGoalDraft(sprint.goal || '');
                setEditingGoal(false);
              }
            }}
            autoFocus
            placeholder="Add a sprint goal..."
            style={{
              width: '100%',
              maxWidth: 800,
              minHeight: 60,
              padding: '6px 8px',
              border: `2px solid ${COLORS.primary}`,
              borderRadius: 3,
              fontSize: 14,
              color: COLORS.textPrimary,
              fontFamily: tokens.fontFamily.sans,
              resize: 'vertical',
              outline: 'none',
            }}
          />
        ) : (
          <p
            onClick={() => setEditingGoal(true)}
            style={{
              margin: 0,
              fontSize: 14,
              color: sprint.goal ? COLORS.textSecondary : COLORS.textTertiary,
              lineHeight: 1.5,
              cursor: 'pointer',
              padding: '4px 8px',
              marginLeft: -8,
              borderRadius: 3,
              fontStyle: sprint.goal ? 'normal' : 'italic',
            }}
            title="Click to edit goal"
            onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.borderLight; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {sprint.goal || 'Add a sprint goal...'}
          </p>
        )}
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {/* Progress Bar */}
        {capacity && (
          <div style={{ flex: 1, maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                {capacity.completed_story_points} / {capacity.total_story_points} points
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                {Math.round(progressPercentage)}%
              </span>
            </div>
            <div
              style={{
                height: 8,
                background: COLORS.borderLight,
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: progressPercentage >= 100 ? COLORS.success : COLORS.primary,
                  width: `${Math.min(progressPercentage, 100)}%`,
                  transition: 'width 300ms ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Days Remaining Badge */}
        {daysLeft !== null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: daysLeft < 0 ? '#FFEBE6' : daysLeft <= 3 ? '#FFF7E6' : '#E3FCEF',
              borderRadius: 3,
            }}
          >
            <Calendar size={14} color={daysLeft < 0 ? COLORS.error : daysLeft <= 3 ? COLORS.warning : COLORS.success} />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: daysLeft < 0 ? COLORS.error : daysLeft <= 3 ? COLORS.warning : COLORS.success,
              }}
            >
              {formatDaysRemaining(daysLeft)}
            </span>
            {canEditDates && (
              <button
                onClick={onEditEndDate}
                title="Edit end date"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'none',
                  border: 'none',
                  padding: 2,
                  marginLeft: 2,
                  cursor: 'pointer',
                  color: 'inherit',
                  opacity: 0.8,
                }}
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
        )}

        {/* Admins can set an end date on a sprint that has none (e.g. one started
            before end dates were required), which unblocks its burndown. */}
        {daysLeft === null && canEditDates && (
          <button
            onClick={onEditEndDate}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: '#FFF7E6',
              border: `1px solid ${COLORS.warning}`,
              borderRadius: 3,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: COLORS.warning,
            }}
          >
            <Calendar size={14} />
            Set end date
          </button>
        )}

        {/* View Burndown Button */}
        <a
          href={`/projects/${projectId}/reports/burndown?sprint=${sprint.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: COLORS.cardBg,
            color: COLORS.primary,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 3,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            textDecoration: 'none',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = COLORS.background;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = COLORS.cardBg;
          }}
        >
          View burndown
        </a>

        {/* Complete Sprint Button */}
        <button
          onClick={onCompleteSprint}
          style={{
            background: COLORS.primary,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 3,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#0747A6';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = COLORS.primary;
          }}
        >
          Complete Sprint
        </button>
      </div>
    </div>
  );
};
