import React from 'react';
import {
  Search,
  LayoutGrid,
  List as ListIcon,
  Download,
  ChevronDown,
  Check,
  User,
  Flag,
} from 'lucide-react';
import { ProjectMember } from '@/lib/api/settings';
import {
  ViewMode,
  SortField,
  SortDirection,
  statusOptions,
  sortOptions,
  secondaryBtn,
} from './constants';

interface EpicsToolbarProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  filterStatus: string;
  setFilterStatus: (value: string) => void;
  filterAssignee: number | '';
  setFilterAssignee: (value: number | '') => void;
  members: ProjectMember[];
  showStatusDropdown: boolean;
  setShowStatusDropdown: (value: boolean) => void;
  showAssigneeDropdown: boolean;
  setShowAssigneeDropdown: (value: boolean) => void;
  showSortDropdown: boolean;
  setShowSortDropdown: (value: boolean) => void;
  sortField: SortField;
  setSortField: (value: SortField) => void;
  sortDirection: SortDirection;
  setSortDirection: (value: SortDirection) => void;
  viewMode: ViewMode;
  setViewMode: (value: ViewMode) => void;
  onExportCSV: () => void;
  canExport: boolean;
  selectedStatusLabel: string;
  selectedAssigneeName: string;
  selectedSortLabel: string;
}

export function EpicsToolbar({
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
  filterAssignee,
  setFilterAssignee,
  members,
  showStatusDropdown,
  setShowStatusDropdown,
  showAssigneeDropdown,
  setShowAssigneeDropdown,
  showSortDropdown,
  setShowSortDropdown,
  sortField,
  setSortField,
  sortDirection,
  setSortDirection,
  viewMode,
  setViewMode,
  onExportCSV,
  canExport,
  selectedStatusLabel,
  selectedAssigneeName,
  selectedSortLabel,
}: EpicsToolbarProps) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #DFE1E6',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
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
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search epics..."
          style={{
            width: 240,
            height: 32,
            paddingLeft: 32,
            paddingRight: 12,
            border: '1px solid #DFE1E6',
            borderRadius: 3,
            backgroundColor: '#F4F5F7',
            color: '#172B4D',
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
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

      {/* Status filter */}
      <div style={{ position: 'relative' }} data-dropdown>
        <button
          onClick={() => {
            setShowStatusDropdown(!showStatusDropdown);
            setShowAssigneeDropdown(false);
            setShowSortDropdown(false);
          }}
          style={{
            ...secondaryBtn,
            backgroundColor: filterStatus ? 'rgba(0, 82, 204, 0.08)' : '#FFFFFF',
            borderColor: filterStatus ? '#0052CC' : '#DFE1E6',
            color: filterStatus ? '#0052CC' : '#42526E',
          }}
        >
          <Flag size={14} />
          <span>{selectedStatusLabel}</span>
          <ChevronDown size={14} />
        </button>
        {showStatusDropdown && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              minWidth: 200,
              backgroundColor: '#FFFFFF',
              border: '1px solid #DFE1E6',
              borderRadius: 3,
              boxShadow: '0 4px 8px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.04)',
              zIndex: 1000,
              padding: '4px 0',
            }}
          >
            {statusOptions.map((opt) => (
              <div
                key={opt.value}
                onClick={() => {
                  setFilterStatus(opt.value);
                  setShowStatusDropdown(false);
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: filterStatus === opt.value ? 600 : 400,
                  color: filterStatus === opt.value ? '#0052CC' : '#42526E',
                  cursor: 'pointer',
                  backgroundColor:
                    filterStatus === opt.value ? 'rgba(0, 82, 204, 0.04)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  if (filterStatus !== opt.value) e.currentTarget.style.backgroundColor = '#F4F5F7';
                }}
                onMouseLeave={(e) => {
                  if (filterStatus !== opt.value) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>{opt.label}</span>
                {filterStatus === opt.value && <Check size={14} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assignee filter */}
      <div style={{ position: 'relative' }} data-dropdown>
        <button
          onClick={() => {
            setShowAssigneeDropdown(!showAssigneeDropdown);
            setShowStatusDropdown(false);
            setShowSortDropdown(false);
          }}
          style={{
            ...secondaryBtn,
            backgroundColor: filterAssignee !== '' ? 'rgba(0, 82, 204, 0.08)' : '#FFFFFF',
            borderColor: filterAssignee !== '' ? '#0052CC' : '#DFE1E6',
            color: filterAssignee !== '' ? '#0052CC' : '#42526E',
          }}
        >
          <User size={14} />
          <span>{selectedAssigneeName}</span>
          <ChevronDown size={14} />
        </button>
        {showAssigneeDropdown && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              minWidth: 220,
              maxHeight: 300,
              overflowY: 'auto',
              backgroundColor: '#FFFFFF',
              border: '1px solid #DFE1E6',
              borderRadius: 3,
              boxShadow: '0 4px 8px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.04)',
              zIndex: 1000,
              padding: '4px 0',
            }}
          >
            <div
              onClick={() => {
                setFilterAssignee('');
                setShowAssigneeDropdown(false);
              }}
              style={{
                padding: '8px 12px',
                fontSize: 13,
                fontWeight: filterAssignee === '' ? 600 : 400,
                color: filterAssignee === '' ? '#0052CC' : '#42526E',
                cursor: 'pointer',
                backgroundColor:
                  filterAssignee === '' ? 'rgba(0, 82, 204, 0.04)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onMouseEnter={(e) => {
                if (filterAssignee !== '') e.currentTarget.style.backgroundColor = '#F4F5F7';
              }}
              onMouseLeave={(e) => {
                if (filterAssignee !== '') e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <span>All assignees</span>
              {filterAssignee === '' && <Check size={14} />}
            </div>
            {members.map((m) => (
              <div
                key={m.user_id}
                onClick={() => {
                  setFilterAssignee(m.user_id);
                  setShowAssigneeDropdown(false);
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: filterAssignee === m.user_id ? 600 : 400,
                  color: filterAssignee === m.user_id ? '#0052CC' : '#42526E',
                  cursor: 'pointer',
                  backgroundColor:
                    filterAssignee === m.user_id ? 'rgba(0, 82, 204, 0.04)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  if (filterAssignee !== m.user_id) e.currentTarget.style.backgroundColor = '#F4F5F7';
                }}
                onMouseLeave={(e) => {
                  if (filterAssignee !== m.user_id) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>{m.name || m.email}</span>
                {filterAssignee === m.user_id && <Check size={14} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sort */}
      <div style={{ position: 'relative' }} data-dropdown>
        <button
          onClick={() => {
            setShowSortDropdown(!showSortDropdown);
            setShowStatusDropdown(false);
            setShowAssigneeDropdown(false);
          }}
          style={secondaryBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#F4F5F7';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#FFFFFF';
          }}
        >
          <span style={{ color: '#8993A4', fontSize: 12 }}>Sort:</span>
          <span>{selectedSortLabel}</span>
          <ChevronDown size={14} />
        </button>
        {showSortDropdown && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              minWidth: 200,
              backgroundColor: '#FFFFFF',
              border: '1px solid #DFE1E6',
              borderRadius: 3,
              boxShadow: '0 4px 8px rgba(0,0,0,0.12), 0 0 1px rgba(0,0,0,0.04)',
              zIndex: 1000,
              padding: '4px 0',
            }}
          >
            {sortOptions.map((opt) => (
              <div
                key={opt.value}
                onClick={() => {
                  setSortField(opt.value);
                  setShowSortDropdown(false);
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: sortField === opt.value ? 600 : 400,
                  color: sortField === opt.value ? '#0052CC' : '#42526E',
                  cursor: 'pointer',
                  backgroundColor:
                    sortField === opt.value ? 'rgba(0, 82, 204, 0.04)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  if (sortField !== opt.value) e.currentTarget.style.backgroundColor = '#F4F5F7';
                }}
                onMouseLeave={(e) => {
                  if (sortField !== opt.value) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>{opt.label}</span>
                {sortField === opt.value && <Check size={14} />}
              </div>
            ))}
            <div
              style={{
                height: 1,
                backgroundColor: '#DFE1E6',
                margin: '4px 0',
              }}
            />
            {(['asc', 'desc'] as SortDirection[]).map((dir) => (
              <div
                key={dir}
                onClick={() => {
                  setSortDirection(dir);
                  setShowSortDropdown(false);
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: sortDirection === dir ? 600 : 400,
                  color: sortDirection === dir ? '#0052CC' : '#42526E',
                  cursor: 'pointer',
                  backgroundColor:
                    sortDirection === dir ? 'rgba(0, 82, 204, 0.04)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  if (sortDirection !== dir) e.currentTarget.style.backgroundColor = '#F4F5F7';
                }}
                onMouseLeave={(e) => {
                  if (sortDirection !== dir) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span>{dir === 'asc' ? 'Ascending' : 'Descending'}</span>
                {sortDirection === dir && <Check size={14} />}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Export */}
      <button
        onClick={onExportCSV}
        disabled={!canExport}
        style={{
          ...secondaryBtn,
          opacity: !canExport ? 0.5 : 1,
          cursor: !canExport ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (canExport) e.currentTarget.style.backgroundColor = '#F4F5F7';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#FFFFFF';
        }}
        title="Export visible epics as CSV"
      >
        <Download size={14} />
        Export
      </button>

      {/* View toggle */}
      <div
        style={{
          display: 'flex',
          border: '1px solid #DFE1E6',
          borderRadius: 3,
          overflow: 'hidden',
          height: 32,
        }}
      >
        <button
          onClick={() => setViewMode('card')}
          style={{
            padding: '0 10px',
            backgroundColor: viewMode === 'card' ? '#DEEBFF' : '#FFFFFF',
            color: viewMode === 'card' ? '#0052CC' : '#42526E',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
          }}
          title="Card view"
        >
          <LayoutGrid size={14} />
        </button>
        <div style={{ width: 1, backgroundColor: '#DFE1E6' }} />
        <button
          onClick={() => setViewMode('table')}
          style={{
            padding: '0 10px',
            backgroundColor: viewMode === 'table' ? '#DEEBFF' : '#FFFFFF',
            color: viewMode === 'table' ? '#0052CC' : '#42526E',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
          }}
          title="Table view"
        >
          <ListIcon size={14} />
        </button>
      </div>
    </div>
  );
}
