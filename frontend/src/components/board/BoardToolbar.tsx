'use client';

import React from 'react';
import {
  Search,
  ChevronDown,
  User,
  FileText,
  Zap,
  Calendar,
  MoreHorizontal,
  Settings,
  Share2,
  Download,
  Edit2,
  Check,
  Tag,
  Flag,
  X,
  Archive,
} from 'lucide-react';
import { tokens } from '../../design-system/tokens';

interface FilterOption {
  id: number | string;
  name: string;
  avatar?: string;
}

interface BoardToolbarProps {
  // The editable board-name block is optional: pages that show the name elsewhere
  // (e.g. the sprint board, whose name lives in its SprintHeader) pass showName={false}
  // and reuse the rest of the toolbar - search, filters, dropdown behaviour - unchanged.
  showName?: boolean;
  boardName?: string;
  isEditingName?: boolean;
  onNameChange?: (name: string) => void;
  onToggleEditName?: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  assigneeFilter: number | 'all';
  onAssigneeFilterChange: (assigneeId: number | 'all') => void;
  assignees: FilterOption[];
  typeFilter: string | 'all';
  onTypeFilterChange: (type: string | 'all') => void;
  types: FilterOption[];
  epicFilter: number | 'all';
  onEpicFilterChange: (epicId: number | 'all') => void;
  epics: FilterOption[];
  priorityFilter: string | 'all';
  onPriorityFilterChange: (priority: string | 'all') => void;
  priorities: FilterOption[];
  labelFilter?: string | 'all';
  onLabelFilterChange?: (label: string | 'all') => void;
  labels?: FilterOption[];
  sprintFilter?: number | 'all';
  onSprintFilterChange?: (sprintId: number | 'all') => void;
  sprints?: FilterOption[];
  groupBy: 'none' | 'assignee' | 'epic' | 'priority';
  onGroupByChange: (groupBy: 'none' | 'assignee' | 'epic' | 'priority') => void;
  showArchived?: boolean;
  onToggleArchived?: () => void;
}

export const BoardToolbar: React.FC<BoardToolbarProps> = ({
  showName = true,
  boardName = '',
  isEditingName = false,
  onNameChange,
  onToggleEditName,
  searchQuery,
  onSearchChange,
  assigneeFilter,
  onAssigneeFilterChange,
  assignees,
  typeFilter,
  onTypeFilterChange,
  types,
  epicFilter,
  onEpicFilterChange,
  epics,
  priorityFilter,
  onPriorityFilterChange,
  priorities,
  labelFilter = 'all',
  onLabelFilterChange,
  labels = [],
  sprintFilter = 'all',
  onSprintFilterChange,
  sprints = [],
  groupBy,
  onGroupByChange,
  showArchived = false,
  onToggleArchived,
}) => {
  const [showAssigneeDropdown, setShowAssigneeDropdown] = React.useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = React.useState(false);
  const [showEpicDropdown, setShowEpicDropdown] = React.useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = React.useState(false);
  const [showLabelDropdown, setShowLabelDropdown] = React.useState(false);
  const [showSprintDropdown, setShowSprintDropdown] = React.useState(false);
  const [showGroupByDropdown, setShowGroupByDropdown] = React.useState(false);

  const closeAllExcept = (keep: string) => {
    if (keep !== 'assignee') setShowAssigneeDropdown(false);
    if (keep !== 'type') setShowTypeDropdown(false);
    if (keep !== 'epic') setShowEpicDropdown(false);
    if (keep !== 'priority') setShowPriorityDropdown(false);
    if (keep !== 'label') setShowLabelDropdown(false);
    if (keep !== 'sprint') setShowSprintDropdown(false);
    if (keep !== 'groupBy') setShowGroupByDropdown(false);
  };
  const [tempBoardName, setTempBoardName] = React.useState(boardName);

  const nameInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Click outside handler to close all dropdowns
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Check if click is outside any dropdown
      if (!target.closest('[data-dropdown]')) {
        setShowAssigneeDropdown(false);
        setShowTypeDropdown(false);
        setShowEpicDropdown(false);
        setShowPriorityDropdown(false);
        setShowLabelDropdown(false);
        setShowSprintDropdown(false);
        setShowGroupByDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleNameSubmit = () => {
    if (tempBoardName.trim()) {
      onNameChange?.(tempBoardName.trim());
    } else {
      setTempBoardName(boardName);
    }
    onToggleEditName?.();
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      setTempBoardName(boardName);
      onToggleEditName?.();
    }
  };

  // Dropdown component
  const Dropdown: React.FC<{
    label: string;
    icon: React.ReactNode;
    value: string | number;
    options: FilterOption[];
    onChange: (value: any) => void;
    isOpen: boolean;
    onToggle: () => void;
    allLabel?: string;
  }> = ({ label, icon, value, options, onChange, isOpen, onToggle, allLabel = 'All' }) => {
    const isFiltered = value !== 'all';
    const selectedOption = options.find((opt) => opt.id === value);

    return (
      <div style={{ position: 'relative' }} data-dropdown>
        <button
          onClick={onToggle}
          style={{
            background: isFiltered ? '#EAF2FF' : '#FFFFFF',
            border: `1px solid ${isFiltered ? '#4C9AFF' : 'rgba(9,30,66,0.14)'}`,
            borderRadius: 8,
            height: 34,
            padding: '0 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            color: isFiltered ? '#0052CC' : '#42526E',
            fontFamily: tokens.fontFamily.sans,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (!isFiltered) {
              e.currentTarget.style.backgroundColor = '#F4F5F7';
            }
          }}
          onMouseLeave={(e) => {
            if (!isFiltered) {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
            }
          }}
        >
          {icon}
          <span>{selectedOption?.name || allLabel}</span>
          <ChevronDown size={14} />
        </button>

        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              minWidth: 200,
              maxHeight: 300,
              overflowY: 'auto',
              backgroundColor: '#FFFFFF',
              border: '1px solid rgba(9,30,66,0.14)',
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(9,30,66,0.18)',
              zIndex: 1000,
              padding: '4px 0',
            }}
          >
            {/* All option */}
            <div
              onClick={() => {
                onChange('all');
                onToggle();
              }}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: value === 'all' ? 600 : 400,
                color: value === 'all' ? '#0052CC' : '#42526E',
                cursor: 'pointer',
                fontFamily: tokens.fontFamily.sans,
                backgroundColor: value === 'all' ? 'rgba(0, 82, 204, 0.04)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onMouseEnter={(e) => {
                if (value !== 'all') {
                  e.currentTarget.style.backgroundColor = '#F4F5F7';
                }
              }}
              onMouseLeave={(e) => {
                if (value !== 'all') {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <span>{allLabel}</span>
              {value === 'all' && <Check size={14} />}
            </div>

            {/* Options */}
            {options.map((option) => (
              <div
                key={option.id}
                onClick={() => {
                  onChange(option.id);
                  onToggle();
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: '13px',
                  fontWeight: value === option.id ? 600 : 400,
                  color: value === option.id ? '#0052CC' : '#42526E',
                  cursor: 'pointer',
                  fontFamily: tokens.fontFamily.sans,
                  backgroundColor: value === option.id ? 'rgba(0, 82, 204, 0.04)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  if (value !== option.id) {
                    e.currentTarget.style.backgroundColor = '#F4F5F7';
                  }
                }}
                onMouseLeave={(e) => {
                  if (value !== option.id) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>{option.name}</span>
                {value === option.id && <Check size={14} />}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #DFE1E6',
        padding: '12px 24px',
      }}
    >
      {/* Top row: Board name + Search */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        {/* Board name (editable) - hidden when the page shows the name elsewhere */}
        {!showName ? (
          <div />
        ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', rowGap: 8 }}>
          {isEditingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                ref={nameInputRef}
                type="text"
                value={tempBoardName}
                onChange={(e) => setTempBoardName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={handleNameSubmit}
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: '#172B4D',
                  fontFamily: tokens.fontFamily.sans,
                  border: '2px solid #0052CC',
                  borderRadius: '3px',
                  padding: '4px 8px',
                  outline: 'none',
                  minWidth: 200,
                }}
              />
            </div>
          ) : (
            <div
              onClick={onToggleEditName}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '3px',
                transition: 'background-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F4F5F7';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: '20px',
                  fontWeight: 600,
                  color: '#172B4D',
                  fontFamily: tokens.fontFamily.sans,
                }}
              >
                {boardName}
              </h1>
              <Edit2 size={16} color="#8993A4" />
            </div>
          )}
        </div>
        )}

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search
            size={14}
            color="#8993A4"
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search issues..."
            style={{
              width: 240,
              height: 32,
              paddingLeft: 32,
              paddingRight: 12,
              border: '1px solid rgba(9,30,66,0.14)',
              borderRadius: '3px',
              backgroundColor: '#F4F5F7',
              color: '#172B4D',
              fontSize: '13px',
              fontFamily: tokens.fontFamily.sans,
              outline: 'none',
              transition: 'all 0.15s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
              e.currentTarget.style.borderColor = '#0052CC';
            }}
            onBlur={(e) => {
              e.currentTarget.style.backgroundColor = '#F4F5F7';
              e.currentTarget.style.borderColor = '#DFE1E6';
            }}
          />
        </div>
      </div>

      {/* Bottom row: Filters + View controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: Quick filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Dropdown
            label="Assignee"
            icon={<User size={14} />}
            value={assigneeFilter}
            options={assignees.map((a) => ({ ...a, name: a.name || (a as any).email || 'Unknown' }))}
            onChange={onAssigneeFilterChange}
            isOpen={showAssigneeDropdown}
            onToggle={() => {
              setShowAssigneeDropdown(!showAssigneeDropdown);
              setShowTypeDropdown(false);
              setShowEpicDropdown(false);
              setShowPriorityDropdown(false);
              setShowGroupByDropdown(false);
            }}
            allLabel="All assignees"
          />

          <Dropdown
            label="Type"
            icon={<FileText size={14} />}
            value={typeFilter}
            options={types}
            onChange={onTypeFilterChange}
            isOpen={showTypeDropdown}
            onToggle={() => {
              setShowTypeDropdown(!showTypeDropdown);
              setShowAssigneeDropdown(false);
              setShowEpicDropdown(false);
              setShowPriorityDropdown(false);
              setShowGroupByDropdown(false);
            }}
            allLabel="All types"
          />

          <Dropdown
            label="Epic"
            icon={<Zap size={14} />}
            value={epicFilter}
            options={epics}
            onChange={onEpicFilterChange}
            isOpen={showEpicDropdown}
            onToggle={() => {
              setShowEpicDropdown(!showEpicDropdown);
              setShowAssigneeDropdown(false);
              setShowTypeDropdown(false);
              setShowPriorityDropdown(false);
              setShowGroupByDropdown(false);
            }}
            allLabel="All epics"
          />

          <Dropdown
            label="Priority"
            icon={<Flag size={14} />}
            value={priorityFilter}
            options={priorities}
            onChange={onPriorityFilterChange}
            isOpen={showPriorityDropdown}
            onToggle={() => {
              const next = !showPriorityDropdown;
              closeAllExcept('priority');
              setShowPriorityDropdown(next);
            }}
            allLabel="All priorities"
          />

          {onLabelFilterChange && (
            <Dropdown
              label="Label"
              icon={<Tag size={14} />}
              value={labelFilter}
              options={labels}
              onChange={onLabelFilterChange}
              isOpen={showLabelDropdown}
              onToggle={() => {
                const next = !showLabelDropdown;
                closeAllExcept('label');
                setShowLabelDropdown(next);
              }}
              allLabel="All labels"
            />
          )}

          {onSprintFilterChange && (
            <Dropdown
              label="Sprint"
              icon={<Calendar size={14} />}
              value={sprintFilter}
              options={sprints}
              onChange={onSprintFilterChange}
              isOpen={showSprintDropdown}
              onToggle={() => {
                const next = !showSprintDropdown;
                closeAllExcept('sprint');
                setShowSprintDropdown(next);
              }}
              allLabel="All sprints"
            />
          )}
        </div>

        {/* Right: View controls + More */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Group-by control commented out: grouping is view-only and drag-to-move
              is disabled while grouped, so the control was misleading. Left in place
              behind `false` for easy restore. */}
          {false && (
          <div style={{ position: 'relative' }} data-dropdown>
            <button
              onClick={() => {
                setShowGroupByDropdown(!showGroupByDropdown);
                setShowAssigneeDropdown(false);
                setShowTypeDropdown(false);
                setShowEpicDropdown(false);
                setShowPriorityDropdown(false);
              }}
              style={{
                background: '#FFFFFF',
                border: '1px solid rgba(9,30,66,0.14)',
                borderRadius: 8,
                height: 34,
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                color: '#42526E',
                fontFamily: tokens.fontFamily.sans,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F4F5F7';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
            >
              <span style={{ color: '#8993A4', fontSize: '12px' }}>Group by:</span>
              <span>{groupBy === 'none' ? 'No grouping' : groupBy === 'assignee' ? 'Assignee' : groupBy === 'epic' ? 'Epic' : 'Priority'}</span>
              <ChevronDown size={14} />
            </button>

            {showGroupByDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  minWidth: 180,
                  backgroundColor: '#FFFFFF',
                  border: '1px solid rgba(9,30,66,0.14)',
                  borderRadius: 8,
                  boxShadow: '0 8px 24px rgba(9,30,66,0.18)',
                  zIndex: 1000,
                  padding: '4px 0',
                }}
              >
                {[
                  { id: 'none', name: 'No grouping' },
                  { id: 'assignee', name: 'Assignee' },
                  { id: 'epic', name: 'Epic' },
                  { id: 'priority', name: 'Priority' },
                ].map((option) => (
                  <div
                    key={option.id}
                    onClick={() => {
                      onGroupByChange(option.id as any);
                      setShowGroupByDropdown(false);
                    }}
                    style={{
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontWeight: groupBy === option.id ? 600 : 400,
                      color: groupBy === option.id ? '#0052CC' : '#42526E',
                      cursor: 'pointer',
                      fontFamily: tokens.fontFamily.sans,
                      backgroundColor: groupBy === option.id ? 'rgba(0, 82, 204, 0.04)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                    onMouseEnter={(e) => {
                      if (groupBy !== option.id) {
                        e.currentTarget.style.backgroundColor = '#F4F5F7';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (groupBy !== option.id) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <span>{option.name}</span>
                    {groupBy === option.id && <Check size={14} />}
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {onToggleArchived && (
            <button
              onClick={onToggleArchived}
              title={showArchived ? 'Hide archived issues' : 'Show archived issues so you can restore them'}
              style={{
                background: showArchived ? '#DEEBFF' : '#FFFFFF',
                border: `1px solid ${showArchived ? '#0052CC' : '#DFE1E6'}`,
                borderRadius: 8,
                height: 34,
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                color: showArchived ? '#0052CC' : '#42526E',
                fontFamily: tokens.fontFamily.sans,
                transition: 'all 0.15s ease',
              }}
            >
              <Archive size={14} />
              <span>{showArchived ? 'Showing archived' : 'Show archived'}</span>
            </button>
          )}

        </div>
      </div>
    </div>
  );
};
