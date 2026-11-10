import React from 'react';
import { ClipboardList } from 'lucide-react';
import { tokens } from '../../../../../design-system/tokens';
import { Sprint } from '../../../../../lib/api/sprints';
import CreateSprintModal from '../../../../../components/CreateSprintModal';
import StartSprintModal from '../../../../../components/StartSprintModal';
import { COLORS } from './constants';

export const NoActiveSprint: React.FC<{
  projectId: number;
  futureSprints: Sprint[];
  showCreateModal: boolean;
  startSprintTarget: Sprint | null;
  onOpenCreate: () => void;
  onCloseCreate: () => void;
  onSprintCreated: (desiredSprintId?: number) => void;
  onStartSprint: (sprint: Sprint) => void;
  onCancelStartSprint: () => void;
  onConfirmStartSprint: (dates: { end_date: string }) => Promise<void>;
}> = ({
  projectId,
  futureSprints,
  showCreateModal,
  startSprintTarget,
  onOpenCreate,
  onCloseCreate,
  onSprintCreated,
  onStartSprint,
  onCancelStartSprint,
  onConfirmStartSprint,
}) => {
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontFamily: tokens.fontFamily.sans,
          background: COLORS.background,
        }}
      >
        <div style={{ textAlign: 'center', padding: 32, width: '100%', maxWidth: 440 }}>
          <div style={{ marginBottom: 16, color: COLORS.textSecondary }}>
            <ClipboardList size={48} strokeWidth={1.5} style={{ display: 'inline-block' }} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 8 }}>No active sprint</div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 20 }}>
            Create a sprint to start planning, then start it to track work here.
          </div>

          <button
            onClick={onOpenCreate}
            style={{
              background: COLORS.primary,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 3,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Create sprint
          </button>

          {futureSprints.length > 0 && (
            <div style={{ marginTop: 28, textAlign: 'left' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Planned sprints
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {futureSprints.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      background: COLORS.cardBg,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      {s.goal && (
                        <div style={{ fontSize: 12, color: COLORS.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.goal}</div>
                      )}
                    </div>
                    <button
                      onClick={() => onStartSprint(s)}
                      style={{
                        background: COLORS.primary,
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 3,
                        padding: '6px 14px',
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Start
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 24, fontSize: 13, color: COLORS.textTertiary }}>
            Want to plan the backlog first?{' '}
            <a
              href={`/projects/${projectId}/backlog`}
              style={{ color: COLORS.primary, textDecoration: 'none', fontWeight: 500 }}
            >
              Open backlog
            </a>
          </div>
        </div>
      </div>

      <CreateSprintModal
        isOpen={showCreateModal}
        onClose={onCloseCreate}
        projectId={projectId}
        onSprintCreated={onSprintCreated}
      />

      <StartSprintModal
        isOpen={!!startSprintTarget}
        onClose={onCancelStartSprint}
        sprint={startSprintTarget}
        onConfirm={onConfirmStartSprint}
      />
    </>
  );
};
