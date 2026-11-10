import React from 'react';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { ButtonCore } from '@/components/ui';
import { EpicWithStats } from '@/lib/api/epics';
import { ProjectMember } from '@/lib/api/settings';
import { sanitizeHtml } from '@/lib/sanitize';
import { StatusVisual } from './constants';
import { sectionLabelStyle, inputBaseStyle, handleInputFocus, handleInputBlur } from './styles';

interface EpicOverviewProps {
  epic: EpicWithStats;
  statusVisual: StatusVisual;
  progressColor: string;
  isUpdatingStatus: boolean;
  onStatusChange: (newStatus: string) => void;
  isUpdatingOwner: boolean;
  members: ProjectMember[];
  onOwnerChange: (newOwnerId: string) => void;
  onAddTickets: () => void;
  onViewTickets: () => void;
  showTickets: boolean;
}

export function EpicOverview({
  epic,
  statusVisual,
  progressColor,
  isUpdatingStatus,
  onStatusChange,
  isUpdatingOwner,
  members,
  onOwnerChange,
  onAddTickets,
  onViewTickets,
  showTickets,
}: EpicOverviewProps) {
  return (
    <>
      {/* Status, Owner and Dates row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16,
        marginBottom: 24,
      }}>
        {/* Status */}
        <div>
          <div style={sectionLabelStyle}>Status</div>
          <select
            value={epic.status}
            onChange={(e) => onStatusChange(e.target.value)}
            disabled={isUpdatingStatus}
            style={{
              ...inputBaseStyle,
              color: statusVisual.color,
              backgroundColor: statusVisual.bg,
              fontWeight: 500,
              cursor: isUpdatingStatus ? 'not-allowed' : 'pointer',
            }}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
          >
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option
              value="completed"
              disabled={epic.completed_tickets < epic.total_tickets}
            >
              Completed {epic.completed_tickets < epic.total_tickets ? '(all tickets must be completed)' : ''}
            </option>
            <option value="cancelled">Cancelled</option>
          </select>
          {epic.completed_tickets < epic.total_tickets && (
            <div style={{
              fontSize: 11,
              color: '#6B778C',
              marginTop: 4,
            }}>
              {epic.total_tickets - epic.completed_tickets} ticket{epic.total_tickets - epic.completed_tickets !== 1 ? 's' : ''} remaining
            </div>
          )}
        </div>

        {/* Owner */}
        <div>
          <div style={sectionLabelStyle}>Owner</div>
          <select
            value={epic.assignee?.id || epic.assignee_id || ''}
            onChange={(e) => onOwnerChange(e.target.value)}
            disabled={isUpdatingOwner || members.length === 0}
            style={{
              ...inputBaseStyle,
              cursor: isUpdatingOwner || members.length === 0 ? 'not-allowed' : 'pointer',
            }}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
          >
            <option value="">Unassigned</option>
            {members.filter(m => m.active !== false).map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.name}
              </option>
            ))}
          </select>
          {members.length === 0 && (
            <div style={{
              fontSize: 11,
              color: '#6B778C',
              marginTop: 4,
            }}>
              Loading members...
            </div>
          )}
        </div>

        {epic.start_date && (
          <div>
            <div style={sectionLabelStyle}>Start date</div>
            <div style={{
              fontSize: 14,
              color: '#172B4D',
              padding: '8px 0',
            }}>
              {new Date(epic.start_date).toLocaleDateString()}
            </div>
          </div>
        )}

        {epic.due_date && (
          <div>
            <div style={sectionLabelStyle}>Due date</div>
            <div style={{
              fontSize: 14,
              color: '#172B4D',
              padding: '8px 0',
            }}>
              {new Date(epic.due_date).toLocaleDateString()}
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      {epic.description && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionLabelStyle}>Description</div>
          {/* Stored as rich-text HTML (same as ticket descriptions), so render it as
              sanitized markup rather than dumping the raw tags as text. */}
          <div
            style={{ fontSize: 14, color: '#42526E', lineHeight: 1.5 }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(epic.description) }}
          />
        </div>
      )}

      {/* Progress panel */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #DFE1E6',
        borderRadius: 3,
        padding: 16,
        marginBottom: 24,
      }}>
        <div style={sectionLabelStyle}>Progress</div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
          marginTop: 4,
        }}>
          <span style={{
            fontSize: 13,
            color: '#42526E',
          }}>
            {epic.completed_tickets} of {epic.total_tickets} tickets completed
          </span>
          <span style={{
            fontSize: 18,
            fontWeight: 600,
            color: '#172B4D',
          }}>
            {epic.progress_percentage}%
          </span>
        </div>

        {/* Flat progress bar */}
        <div style={{
          height: 4,
          backgroundColor: '#DFE1E6',
          borderRadius: 2,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            height: '100%',
            width: `${epic.progress_percentage}%`,
            backgroundColor: progressColor,
            transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Ticket breakdown */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
        }}>
          <div style={{
            padding: 12,
            backgroundColor: '#F4F5F7',
            borderRadius: 3,
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 20,
              fontWeight: 600,
              color: '#5E6C84',
              lineHeight: 1,
              marginBottom: 4,
            }}>
              {epic.todo_tickets}
            </div>
            <div style={{
              fontSize: 11,
              color: '#6B778C',
              fontWeight: 500,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}>
              To do
            </div>
          </div>
          <div style={{
            padding: 12,
            backgroundColor: '#DEEBFF',
            borderRadius: 3,
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 20,
              fontWeight: 600,
              color: '#0052CC',
              lineHeight: 1,
              marginBottom: 4,
            }}>
              {epic.in_progress_tickets}
            </div>
            <div style={{
              fontSize: 11,
              color: '#0052CC',
              fontWeight: 500,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}>
              In progress
            </div>
          </div>
          <div style={{
            padding: 12,
            backgroundColor: '#E3FCEF',
            borderRadius: 3,
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 20,
              fontWeight: 600,
              color: '#00875A',
              lineHeight: 1,
              marginBottom: 4,
            }}>
              {epic.completed_tickets}
            </div>
            <div style={{
              fontSize: 11,
              color: '#00875A',
              fontWeight: 500,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}>
              Completed
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 24,
      }}>
        <ButtonCore
          variant="primary"
          onClick={onAddTickets}
          leftIcon={<Plus size={14} />}
        >
          Add tickets to epic
        </ButtonCore>
        <button
          onClick={onViewTickets}
          style={{
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 500,
            color: '#42526E',
            backgroundColor: 'transparent',
            border: '1px solid #DFE1E6',
            borderRadius: 3,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 32,
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#F4F5F7';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {showTickets ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showTickets ? 'Hide' : 'View'} all tickets ({epic.total_tickets})
        </button>
      </div>
    </>
  );
}
