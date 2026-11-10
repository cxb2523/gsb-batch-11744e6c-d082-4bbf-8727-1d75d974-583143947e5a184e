'use client';

import React from 'react';
import { tokens } from '@/design-system/tokens';

interface FilterOption {
  label: string;
  value: string | number;
}

interface ReportFiltersProps {
  sprints?: FilterOption[];
  selectedSprint?: string | number;
  onSprintChange?: (sprintId: string | number) => void;

  dateFrom?: string;
  dateTo?: string;
  onDateRangeChange?: (from: string, to: string) => void;

  epics?: FilterOption[];
  selectedEpics?: (string | number)[];
  onEpicsChange?: (epicIds: (string | number)[]) => void;

  issueTypes?: FilterOption[];
  selectedIssueTypes?: string[];
  onIssueTypesChange?: (types: string[]) => void;

  assignees?: FilterOption[];
  selectedAssignees?: (string | number)[];
  onAssigneesChange?: (assigneeIds: (string | number)[]) => void;

  numSprints?: number;
  onNumSprintsChange?: (num: number) => void;

  onApply?: () => void;
  onReset?: () => void;

  className?: string;
}

/**
 * The filter rail. It was the last Tailwind-styled piece on the report pages —
 * 2px gray-300 borders and blue focus rings next to token-styled inputs
 * everywhere else — so the controls are now built from the same tokens as the
 * rest of the app.
 */

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: tokens.colors.neutral[700],
  marginBottom: 6,
};

const controlStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 12px',
  fontFamily: tokens.fontFamily.sans,
  fontSize: 13,
  color: tokens.colors.neutral[900],
  background: tokens.colors.semantic.background.default,
  border: `1px solid ${tokens.colors.neutral[300]}`,
  borderRadius: 8,
  outline: 'none',
  cursor: 'pointer',
};

const selectStyle: React.CSSProperties = {
  ...controlStyle,
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  paddingRight: 32,
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%236B778C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
};

const listBoxStyle: React.CSSProperties = {
  maxHeight: 160,
  overflowY: 'auto',
  border: `1px solid ${tokens.colors.neutral[200]}`,
  borderRadius: 8,
  padding: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const checkRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 6px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  color: tokens.colors.neutral[800],
};

const checkboxStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  accentColor: tokens.colors.primary[500],
  cursor: 'pointer',
  flexShrink: 0,
};

const actionButtonStyle: React.CSSProperties = {
  flex: 1,
  height: 36,
  fontFamily: tokens.fontFamily.sans,
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 8,
  cursor: 'pointer',
  border: '1px solid transparent',
};

export default function ReportFilters({
  sprints,
  selectedSprint,
  onSprintChange,
  dateFrom,
  dateTo,
  onDateRangeChange,
  epics,
  selectedEpics = [],
  onEpicsChange,
  issueTypes,
  selectedIssueTypes = [],
  onIssueTypesChange,
  assignees,
  selectedAssignees = [],
  onAssigneesChange,
  numSprints,
  onNumSprintsChange,
  onApply,
  onReset,
  className = '',
}: ReportFiltersProps) {
  return (
    <div className={className} style={{ fontFamily: tokens.fontFamily.sans }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Sprint Selector */}
        {sprints && onSprintChange && (
          <div>
            <label style={labelStyle}>Sprint</label>
            <select
              value={selectedSprint || ''}
              onChange={(e) => onSprintChange(e.target.value)}
              style={selectStyle}
            >
              <option value="">Select Sprint</option>
              {sprints.map((sprint) => (
                <option key={sprint.value} value={sprint.value}>
                  {sprint.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Number of Sprints Selector */}
        {numSprints !== undefined && onNumSprintsChange && (
          <div>
            <label style={labelStyle}>Number of Sprints</label>
            <select
              value={numSprints}
              onChange={(e) => onNumSprintsChange(Number(e.target.value))}
              style={selectStyle}
            >
              <option value={6}>Last 6 Sprints</option>
              <option value={12}>Last 12 Sprints</option>
              <option value={24}>Last 24 Sprints</option>
            </select>
          </div>
        )}

        {/* Date Range Picker */}
        {onDateRangeChange && (
          <div>
            <label style={labelStyle}>Date Range</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="date"
                value={dateFrom || ''}
                onChange={(e) => onDateRangeChange(e.target.value, dateTo || '')}
                style={controlStyle}
              />
              <input
                type="date"
                value={dateTo || ''}
                onChange={(e) => onDateRangeChange(dateFrom || '', e.target.value)}
                style={controlStyle}
              />
            </div>
          </div>
        )}

        {/* Epic Filter */}
        {epics && onEpicsChange && (
          <div>
            <label style={labelStyle}>Epics</label>
            <div style={listBoxStyle}>
              {epics.map((epic) => (
                <label key={epic.value} style={checkRowStyle}>
                  <input
                    type="checkbox"
                    checked={selectedEpics.includes(epic.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onEpicsChange([...selectedEpics, epic.value]);
                      } else {
                        onEpicsChange(selectedEpics.filter((id) => id !== epic.value));
                      }
                    }}
                    style={checkboxStyle}
                  />
                  <span>{epic.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Issue Type Filter */}
        {issueTypes && onIssueTypesChange && (
          <div>
            <label style={labelStyle}>Issue Types</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {issueTypes.map((type) => (
                <label key={type.value} style={checkRowStyle}>
                  <input
                    type="checkbox"
                    checked={selectedIssueTypes.includes(type.value as string)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onIssueTypesChange([...selectedIssueTypes, type.value as string]);
                      } else {
                        onIssueTypesChange(
                          selectedIssueTypes.filter((t) => t !== type.value)
                        );
                      }
                    }}
                    style={checkboxStyle}
                  />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Assignee Filter */}
        {assignees && onAssigneesChange && (
          <div>
            <label style={labelStyle}>Assignees</label>
            <div style={listBoxStyle}>
              {assignees.map((assignee) => (
                <label key={assignee.value} style={checkRowStyle}>
                  <input
                    type="checkbox"
                    checked={selectedAssignees.includes(assignee.value)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onAssigneesChange([...selectedAssignees, assignee.value]);
                      } else {
                        onAssigneesChange(
                          selectedAssignees.filter((id) => id !== assignee.value)
                        );
                      }
                    }}
                    style={checkboxStyle}
                  />
                  <span>{assignee.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {(onApply || onReset) && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 16,
            paddingTop: 16,
            borderTop: `1px solid ${tokens.colors.neutral[200]}`,
          }}
        >
          {onReset && (
            <button
              onClick={onReset}
              style={{
                ...actionButtonStyle,
                background: tokens.colors.semantic.background.default,
                borderColor: tokens.colors.neutral[300],
                color: tokens.colors.neutral[800],
              }}
            >
              Reset
            </button>
          )}
          {onApply && (
            <button
              onClick={onApply}
              style={{
                ...actionButtonStyle,
                background: tokens.colors.primary[500],
                borderColor: tokens.colors.primary[500],
                color: '#fff',
                fontWeight: 600,
              }}
            >
              Apply
            </button>
          )}
        </div>
      )}
    </div>
  );
}
