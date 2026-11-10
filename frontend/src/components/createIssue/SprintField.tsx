import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { Sprint } from '../../lib/api/sprints';

type Dispatch<T> = React.Dispatch<React.SetStateAction<T>>;

interface SprintFieldProps {
  sprintId: number | null;
  setSprintId: Dispatch<number | null>;
  sprints: Sprint[];
  showSprintDropdown: boolean;
  setShowSprintDropdown: Dispatch<boolean>;
  sprintDropdownRef: React.RefObject<HTMLDivElement | null>;
  setShowTypeDropdown: Dispatch<boolean>;
  setShowPriorityDropdown: Dispatch<boolean>;
  setShowAssigneeDropdown: Dispatch<boolean>;
  setShowEpicDropdown: Dispatch<boolean>;
  setShowLabelsDropdown: Dispatch<boolean>;
  setShowParentDropdown: Dispatch<boolean>;
}

/** Sprint picker (hidden for epics). */
export function SprintField(props: SprintFieldProps) {
  const {
    sprintId, setSprintId, sprints, showSprintDropdown, setShowSprintDropdown, sprintDropdownRef,
    setShowTypeDropdown, setShowPriorityDropdown, setShowAssigneeDropdown,
    setShowEpicDropdown, setShowLabelsDropdown, setShowParentDropdown,
  } = props;
  return (
        <div style={{ marginBottom: 24, position: 'relative' }} ref={sprintDropdownRef}>
          <label
            style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 14,
              fontWeight: 600,
              color: '#0a0a0a',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            Sprint
          </label>
          <button
            onClick={() => {
              setShowSprintDropdown(!showSprintDropdown);
              if (!showSprintDropdown) {
                setShowTypeDropdown(false);
                setShowPriorityDropdown(false);
                setShowAssigneeDropdown(false);
                setShowEpicDropdown(false);
                setShowParentDropdown(false);
                setShowLabelsDropdown(false);
              }
            }}
            style={{
              width: '100%',
              padding: '12px 16px',
              backgroundColor: 'white',
              border: '1px solid rgba(0,0,0,0.1)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              fontSize: 16,
              fontFamily: tokens.fontFamily.sans,
              color: sprintId ? tokens.colors.semantic.text.primary : tokens.colors.semantic.text.tertiary,
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1, textAlign: 'left' }}>{sprints.find(s => s.id === sprintId)?.name || 'No Sprint / Backlog'}</span>
            <ChevronDown size={20} />
          </button>

          {showSprintDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 4,
                backgroundColor: 'white',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 1000,
                maxHeight: 250,
                overflowY: 'auto',
              }}
            >
              <button
                onClick={() => {
                  setSprintId(null);
                  setShowSprintDropdown(false);
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  backgroundColor: sprintId === null ? 'rgba(248,250,252,0.8)' : 'white',
                  border: 'none',
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  fontSize: 16,
                  fontFamily: tokens.fontFamily.sans,
                  color: '#0a0a0a',
                }}
                onMouseEnter={(e) => {
                  if (sprintId !== null) {
                    e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (sprintId !== null) {
                    e.currentTarget.style.backgroundColor = 'white';
                  }
                }}
              >
                {sprintId === null && <Check size={16} />}
                <span>Backlog (No Sprint)</span>
              </button>
              {sprints.map((sprint) => (
                <button
                  key={sprint.id}
                  onClick={() => {
                    setSprintId(sprint.id);
                    setShowSprintDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    backgroundColor: sprintId === sprint.id ? 'rgba(248,250,252,0.8)' : 'white',
                    border: 'none',
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    fontSize: 16,
                    fontFamily: tokens.fontFamily.sans,
                    color: '#0a0a0a',
                  }}
                  onMouseEnter={(e) => {
                    if (sprintId !== sprint.id) {
                      e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.5)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (sprintId !== sprint.id) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  {sprintId === sprint.id && <Check size={16} />}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
                    <span>{sprint.name}</span>
                    {sprint.start_date && sprint.end_date && (
                      <span style={{ fontSize: 12, color: tokens.colors.neutral[500] }}>
                        {new Date(sprint.start_date).toLocaleDateString()} - {new Date(sprint.end_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
  );
}
