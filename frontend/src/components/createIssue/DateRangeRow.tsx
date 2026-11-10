import React from 'react';
import { tokens } from '../../design-system/tokens';

interface DateRangeRowProps {
  startDate: string;
  setStartDate: React.Dispatch<React.SetStateAction<string>>;
  storyPoints: string;
  setStoryPoints: React.Dispatch<React.SetStateAction<string>>;
  type: string;
}

/** Start-date + story-points row (story points hidden for epics). */
export function DateRangeRow({ startDate, setStartDate, storyPoints, setStoryPoints, type }: DateRangeRowProps) {
  return (
        <div style={{ display: 'grid', gridTemplateColumns: type === 'epic' ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24, minWidth: 0 }}>
          {/* Start Date */}
          <div>
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
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: 'white',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: 8,
                fontSize: 16,
                fontFamily: tokens.fontFamily.sans,
                color: '#0a0a0a',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 150ms ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.primary[500];
                e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[500]}20`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Story Points - Hidden for Epics */}
          {type !== 'epic' && (
            <div>
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
              Story Points
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={storyPoints}
              onChange={(e) => setStoryPoints(e.target.value)}
              placeholder="0"
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: 'white',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: 8,
                fontSize: 16,
                fontFamily: tokens.fontFamily.sans,
                color: '#0a0a0a',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 150ms ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.primary[500];
                e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[500]}20`;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            </div>
          )}
        </div>
  );
}
