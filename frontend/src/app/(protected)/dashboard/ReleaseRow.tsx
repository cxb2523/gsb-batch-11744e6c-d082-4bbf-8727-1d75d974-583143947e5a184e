import React from 'react';
import { C, statusChipStyle } from './constants';
import { daysUntil, statusVisual } from './helpers';
import { ReleaseInfo } from './types';

export function ReleaseRow({ release, onClick }: { release: ReleaseInfo; onClick: () => void }) {
  const dueDays = daysUntil(release.release_date);
  const sv = statusVisual(release.status === 'in-progress' ? 'In Progress' : release.status);
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${C.borderSubtle}`,
        cursor: 'pointer',
        transition: 'background-color 0.12s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = C.pageBg;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.heading,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {release.version || release.name}
      </div>
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: C.muted,
        }}
      >
        <span style={{ ...statusChipStyle, color: sv.color, backgroundColor: sv.bg }}>
          {release.status}
        </span>
        <span>{release.project_key}</span>
        {release.release_date && (
          <span style={{ color: dueDays !== null && dueDays < 7 ? C.warning : C.muted }}>
            {dueDays !== null && dueDays >= 0 && dueDays <= 7
              ? dueDays === 0
                ? 'today'
                : `in ${dueDays}d`
              : new Date(release.release_date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
          </span>
        )}
      </div>
    </div>
  );
}
