'use client';

import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { tokens } from '../design-system/tokens';
import { Sprint } from '../lib/api/sprints';

interface SprintCalendarProps {
  sprints: Sprint[];
  activeSprint: Sprint | null;
  onSprintClick: (sprint: Sprint) => void;
}

const COLORS: Record<string, { bg: string; border: string; text: string }> = {
  active: {
    bg: 'rgba(54, 179, 126, 0.15)',
    border: '#36B37E',
    text: '#00875A',
  },
  future: {
    bg: 'rgba(0, 82, 204, 0.08)',
    border: '#0052CC',
    text: '#0052CC',
  },
  closed: {
    bg: 'rgba(151, 160, 175, 0.08)',
    border: '#97A0AF',
    text: '#5E6C84',
  },
};

const SprintCalendar: React.FC<SprintCalendarProps> = ({ sprints, activeSprint, onSprintClick }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isExpanded, setIsExpanded] = useState(true);

  // Get days in current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get sprints that overlap with current month
  const visibleSprints = sprints.filter(sprint => {
    if (!sprint.start_date && !sprint.end_date) return false;

    const sprintStart = sprint.start_date ? new Date(sprint.start_date) : null;
    const sprintEnd = sprint.end_date ? new Date(sprint.end_date) : null;

    // Check if sprint overlaps with current month
    if (sprintStart && sprintEnd) {
      return (
        isWithinInterval(sprintStart, { start: monthStart, end: monthEnd }) ||
        isWithinInterval(sprintEnd, { start: monthStart, end: monthEnd }) ||
        (sprintStart <= monthStart && sprintEnd >= monthEnd)
      );
    }
    return false;
  });

  // Check if a day is within a sprint
  const getSprintForDay = (day: Date): Sprint | null => {
    for (const sprint of visibleSprints) {
      if (!sprint.start_date || !sprint.end_date) continue;

      const sprintStart = startOfDay(new Date(sprint.start_date));
      const sprintEnd = endOfDay(new Date(sprint.end_date));

      if (isWithinInterval(day, { start: sprintStart, end: sprintEnd })) {
        return sprint;
      }
    }
    return null;
  };

  if (!isExpanded) {
    return (
      <div
        style={{
          background: '#fff',
          borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
          padding: '12px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(true)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: tokens.colors.neutral[900] }}>
            Sprint Calendar
          </span>
          {activeSprint && activeSprint.start_date && activeSprint.end_date && (
            <span style={{ fontSize: 12, color: tokens.colors.neutral[600] }}>
              {format(new Date(activeSprint.start_date), 'MMM d')} - {format(new Date(activeSprint.end_date), 'MMM d, yyyy')}
            </span>
          )}
        </div>
        <ChevronRight size={16} color={tokens.colors.neutral[600]} />
      </div>
    );
  }

  return (
    <div
      style={{
        background: '#fff',
        borderBottom: `2px solid ${tokens.colors.neutral[200]}`,
        padding: '20px 32px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: tokens.colors.neutral[900] }}>
            Sprint Calendar
          </h3>
          <button
            onClick={() => setIsExpanded(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: tokens.colors.neutral[600],
              fontSize: 12,
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            Collapse
          </button>
        </div>

        {/* Month Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
            style={{
              background: '#fff',
              border: `1px solid ${tokens.colors.neutral[300]}`,
              borderRadius: 4,
              padding: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={16} color={tokens.colors.neutral[700]} />
          </button>

          <span style={{ fontSize: 14, fontWeight: 600, color: tokens.colors.neutral[900], minWidth: 120, textAlign: 'center' }}>
            {format(currentMonth, 'MMMM yyyy')}
          </span>

          <button
            onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
            style={{
              background: '#fff',
              border: `1px solid ${tokens.colors.neutral[300]}`,
              borderRadius: 4,
              padding: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronRight size={16} color={tokens.colors.neutral[700]} />
          </button>

          <button
            onClick={() => setCurrentMonth(new Date())}
            style={{
              background: '#fff',
              border: `1px solid ${tokens.colors.neutral[300]}`,
              borderRadius: 4,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              color: tokens.colors.neutral[700],
              cursor: 'pointer',
            }}
          >
            Today
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {/* Day headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div
            key={day}
            style={{
              padding: '8px 4px',
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 600,
              color: tokens.colors.neutral[600],
              textTransform: 'uppercase',
            }}
          >
            {day}
          </div>
        ))}

        {/* Calendar days */}
        {daysInMonth.map(day => {
          const sprint = getSprintForDay(day);
          const isToday = isSameDay(day, new Date());
          const colors = sprint ? COLORS[sprint.state] : null;
          const isActive = sprint?.id === activeSprint?.id;

          return (
            <div
              key={day.toISOString()}
              onClick={() => sprint && onSprintClick(sprint)}
              style={{
                minHeight: 60,
                padding: 6,
                border: `1px solid ${isToday ? tokens.colors.primary[500] : tokens.colors.neutral[200]}`,
                borderRadius: 4,
                background: colors ? colors.bg : '#fff',
                cursor: sprint ? 'pointer' : 'default',
                position: 'relative',
                transition: 'all 0.15s',
                ...(sprint && {
                  borderColor: colors?.border,
                  borderWidth: isActive ? 2 : 1,
                }),
              }}
              onMouseEnter={(e) => {
                if (sprint) {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
                  e.currentTarget.style.zIndex = '10';
                }
              }}
              onMouseLeave={(e) => {
                if (sprint) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.zIndex = '1';
                }
              }}
            >
              {/* Day number */}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: isToday ? 600 : 500,
                  color: isToday ? tokens.colors.primary[700] : tokens.colors.neutral[700],
                  marginBottom: 4,
                }}
              >
                {format(day, 'd')}
              </div>

              {/* Sprint indicator */}
              {sprint && (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: colors?.text,
                    background: 'rgba(255, 255, 255, 0.9)',
                    padding: '2px 4px',
                    borderRadius: 3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    border: `1px solid ${colors?.border}`,
                  }}
                  title={sprint.name}
                >
                  {sprint.name}
                </div>
              )}

              {/* Active indicator */}
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: COLORS.active.border,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Sprint Legend */}
      {visibleSprints.length > 0 && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: tokens.colors.neutral[50], borderRadius: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: tokens.colors.neutral[700], marginBottom: 8 }}>
            Sprints this month:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {visibleSprints.map(sprint => {
              const colors = COLORS[sprint.state];
              const isActive = sprint.id === activeSprint?.id;

              return (
                <button
                  key={sprint.id}
                  onClick={() => onSprintClick(sprint)}
                  style={{
                    background: colors.bg,
                    border: `2px solid ${isActive ? colors.border : 'transparent'}`,
                    borderRadius: 4,
                    padding: '6px 10px',
                    fontSize: 12,
                    fontWeight: 500,
                    color: colors.text,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = colors.border;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'transparent';
                    }
                  }}
                >
                  {sprint.name}
                  {sprint.start_date && sprint.end_date && (
                    <span style={{ marginLeft: 6, opacity: 0.7 }}>
                      ({format(new Date(sprint.start_date), 'MMM d')} - {format(new Date(sprint.end_date), 'MMM d')})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SprintCalendar;
