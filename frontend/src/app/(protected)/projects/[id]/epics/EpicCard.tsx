import React from 'react';
import { Calendar } from 'lucide-react';
import { EpicIcon } from '@/components/icons/EpicIcon';
import { EpicListItem } from '@/lib/api/epics';
import { getStatusVisual } from './constants';
import { getDueDateStatus } from './helpers';

export function EpicCard({ epic, onClick }: { epic: EpicListItem; onClick: () => void }) {
  const statusVisual = getStatusVisual(epic.status);
  const dueDateStatus = getDueDateStatus(epic.due_date);
  const progressColor = epic.progress_percentage === 100 ? '#00875A' : '#0052CC';

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #DFE1E6',
        borderRadius: 3,
        padding: 16,
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#B3BAC5';
        e.currentTarget.style.boxShadow = '0 1px 1px rgba(9, 30, 66, 0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#DFE1E6';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <EpicIcon size={14} color={epic.color} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#5E6C84',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          {epic.key}
        </span>
        <span
          style={{
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 600,
            color: statusVisual.color,
            backgroundColor: statusVisual.bg,
            borderRadius: 3,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {statusVisual.label}
        </span>
      </div>

      <h3
        style={{
          margin: 0,
          marginBottom: 14,
          fontSize: 14,
          fontWeight: 600,
          color: '#172B4D',
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {epic.title}
      </h3>

      {/* Progress */}
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 12, color: '#5E6C84' }}>Progress</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#172B4D',
            }}
          >
            {epic.completed_tickets} / {epic.total_tickets}
            <span style={{ color: '#5E6C84', fontWeight: 400, marginLeft: 4 }}>
              ({epic.progress_percentage}%)
            </span>
          </span>
        </div>
        <div
          style={{
            height: 4,
            backgroundColor: '#DFE1E6',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${epic.progress_percentage}%`,
              backgroundColor: progressColor,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 12,
          borderTop: '1px solid #DFE1E6',
          gap: 8,
        }}
      >
        {epic.assignee ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                backgroundColor: epic.color,
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {epic.assignee.initials}
            </div>
            <span
              style={{
                fontSize: 12,
                color: '#42526E',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {epic.assignee.name}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: '#97A0AF' }}>Unassigned</span>
        )}

        {epic.due_date && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              backgroundColor: dueDateStatus?.bg || '#F4F5F7',
              borderRadius: 3,
            }}
          >
            <Calendar size={11} color={dueDateStatus?.color || '#5E6C84'} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: dueDateStatus?.color || '#5E6C84',
              }}
            >
              {dueDateStatus?.label ||
                new Date(epic.due_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
