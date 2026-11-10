'use client';

import React from 'react';
import { X, Link2, Check } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { BoardFilters, activeFilters } from '../../lib/boardFilters';

interface Option {
  id: number | string;
  name: string;
}

export interface ActiveFilterChipsProps {
  filters: BoardFilters;
  assignees: Option[];
  types: Option[];
  epics: Option[];
  priorities: Option[];
  labels: Option[];
  sprints: Option[];
  onRemove: (key: keyof BoardFilters) => void;
  onClearAll: () => void;
}

const LABELS: Record<string, string> = {
  search: 'Search',
  assignee: 'Assignee',
  type: 'Type',
  epic: 'Epic',
  priority: 'Priority',
  label: 'Label',
  sprint: 'Sprint',
};

/**
 * Spells out which filters are hiding issues, and lets each one be removed individually.
 *
 * Without this the board can silently lie: filters survive a reload, so you return to a
 * board that is missing most of its issues with nothing on screen explaining why.
 */
export const ActiveFilterChips: React.FC<ActiveFilterChipsProps> = ({
  filters,
  assignees,
  types,
  epics,
  priorities,
  labels,
  sprints,
  onRemove,
  onClearAll,
}) => {
  const [copied, setCopied] = React.useState(false);
  const active = activeFilters(filters);

  if (active.length === 0) return null;

  const optionsFor = (key: string): Option[] => {
    switch (key) {
      case 'assignee':
        return assignees;
      case 'type':
        return types;
      case 'epic':
        return epics;
      case 'priority':
        return priorities;
      case 'label':
        return labels;
      case 'sprint':
        return sprints;
      default:
        return [];
    }
  };

  // Show the human name ("Alex"), not the raw id ("7").
  const displayValue = (key: string, value: string | number): string => {
    if (key === 'search') return `"${value}"`;
    const match = optionsFor(key).find((o) => String(o.id) === String(value));
    return match ? match.name : String(value);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked - the URL is still in the address bar
    }
  };

  return (
    // Reads as a second row of the toolbar rather than chips floating on the board:
    // same white surface, same 24px gutter, and the divider sits *below* it.
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        rowGap: 8,
        padding: '10px 24px',
        background: '#FFFFFF',
        borderBottom: '1px solid rgba(9,30,66,0.08)',
        fontFamily: tokens.fontFamily.sans,
      }}
    >
      <span style={{ fontSize: 12, color: '#626F86', fontWeight: 600 }}>Filters</span>

      {active.map(({ key, value }) => (
        <span
          key={key}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: '#DEEBFF',
            border: '1px solid #B3D4FF',
            color: '#0747A6',
            borderRadius: 12,
            padding: '3px 6px 3px 10px',
            fontSize: 12,
            fontWeight: 500,
            maxWidth: 260,
          }}
        >
          <span
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={`${LABELS[key as string]}: ${displayValue(key as string, value)}`}
          >
            <span style={{ opacity: 0.75 }}>{LABELS[key as string]}:</span>{' '}
            {displayValue(key as string, value)}
          </span>
          <button
            onClick={() => onRemove(key)}
            aria-label={`Remove ${LABELS[key as string]} filter`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'transparent',
              color: '#0747A6',
              cursor: 'pointer',
              padding: 2,
              borderRadius: '50%',
              lineHeight: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#B3D4FF';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={12} />
          </button>
        </span>
      ))}

      <button
        onClick={onClearAll}
        style={{
          border: 'none',
          background: 'transparent',
          color: '#5E6C84',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          textDecoration: 'underline',
          padding: '2px 4px',
        }}
      >
        Clear all
      </button>

      {/* Filters are in the URL, so the current view is directly shareable. */}
      <button
        onClick={copyLink}
        title="Copy a link to this filtered board"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          border: 'none',
          background: 'transparent',
          color: copied ? '#006644' : '#5E6C84',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          padding: '2px 4px',
        }}
      >
        {copied ? <Check size={12} /> : <Link2 size={12} />}
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  );
};

export default ActiveFilterChips;
