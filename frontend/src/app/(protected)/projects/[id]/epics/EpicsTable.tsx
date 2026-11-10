import React from 'react';
import { Calendar, Eye } from 'lucide-react';
import { EpicIcon } from '@/components/icons/EpicIcon';
import { EpicListItem } from '@/lib/api/epics';
import { getStatusVisual } from './constants';
import { getDueDateStatus } from './helpers';

interface EpicsTableProps {
  epics: EpicListItem[];
  onEpicClick: (epicId: number) => void;
}

export function EpicsTable({ epics, onEpicClick }: EpicsTableProps) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #DFE1E6',
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}
      >
        <thead>
          <tr
            style={{
              backgroundColor: '#F4F5F7',
              borderBottom: '1px solid #DFE1E6',
            }}
          >
            {['Epic', 'Status', 'Progress', 'Owner', 'Due Date', ''].map((label, i) => (
              <th
                key={i}
                style={{
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#5E6C84',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  width: i === 5 ? 50 : undefined,
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {epics.map((epic, index) => {
            const statusVisual = getStatusVisual(epic.status);
            const dueDateStatus = getDueDateStatus(epic.due_date);
            const progressColor =
              epic.progress_percentage === 100 ? '#00875A' : '#0052CC';

            return (
              <tr
                key={epic.id}
                onClick={() => onEpicClick(epic.id)}
                style={{
                  borderBottom:
                    index < epics.length - 1 ? '1px solid #DFE1E6' : 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F4F5F7';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <EpicIcon size={14} color={epic.color} />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#5E6C84',
                          letterSpacing: 0.5,
                          textTransform: 'uppercase',
                          marginBottom: 2,
                        }}
                      >
                        {epic.key}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#172B4D',
                        }}
                      >
                        {epic.title}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span
                    style={{
                      display: 'inline-flex',
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
                </td>
                <td style={{ padding: '10px 12px', minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        flex: 1,
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
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#172B4D',
                        minWidth: 36,
                        textAlign: 'right',
                      }}
                    >
                      {epic.progress_percentage}%
                    </span>
                  </div>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {epic.assignee ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                        }}
                      >
                        {epic.assignee.initials}
                      </div>
                      <span style={{ fontSize: 13, color: '#172B4D' }}>
                        {epic.assignee.name}
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 13, color: '#97A0AF' }}>Unassigned</span>
                  )}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {epic.due_date ? (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 6px',
                        backgroundColor: dueDateStatus?.bg || '#F4F5F7',
                        borderRadius: 3,
                      }}
                    >
                      <Calendar
                        size={11}
                        color={dueDateStatus?.color || '#5E6C84'}
                      />
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: dueDateStatus?.color || '#5E6C84',
                        }}
                      >
                        {new Date(epic.due_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 13, color: '#97A0AF' }}>-</span>
                  )}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEpicClick(epic.id);
                    }}
                    style={{
                      padding: 4,
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#5E6C84',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#DFE1E6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title="View details"
                  >
                    <Eye size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
