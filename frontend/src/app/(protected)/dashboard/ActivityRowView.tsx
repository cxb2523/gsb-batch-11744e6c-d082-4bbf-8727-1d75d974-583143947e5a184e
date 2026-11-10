import React from 'react';
import { ArrowRight } from 'lucide-react';
import { C } from './constants';
import { relativeTime } from './helpers';
import { ActivityRow } from './types';

export function ActivityRowView({
  activity,
  onClick,
}: {
  activity: ActivityRow;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${C.borderSubtle}`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        transition: 'background-color 0.12s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = C.pageBg;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: C.body, marginBottom: 2 }}>
          <span style={{ color: C.heading, fontWeight: 500 }}>{activity.user_name}</span>{' '}
          {activity.action}{' '}
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: C.link,
              fontWeight: 500,
            }}
          >
            {activity.issue_key}
          </span>
        </div>
        <div
          style={{
            fontSize: 13,
            color: C.subtle,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activity.issue_title}
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>
        {relativeTime(activity.timestamp)}
      </div>
      <ArrowRight size={14} color={C.disabled} />
    </div>
  );
}
