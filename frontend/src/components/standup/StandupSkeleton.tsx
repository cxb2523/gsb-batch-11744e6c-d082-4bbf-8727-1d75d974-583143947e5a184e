'use client';

import React from 'react';
import { C, RADIUS, SHADOW, space } from './tokens';

const card: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: RADIUS.lg,
  boxShadow: SHADOW.card,
};

function Bar({ width, height = 12 }: { width: number | string; height?: number }) {
  return <div className="su-skeleton" style={{ width, height }} />;
}

/** Same grid, widths and rhythm as the loaded board, so nothing jumps when data arrives. */
export function StandupSkeleton() {
  return (
    <div className="su-layout" aria-busy="true" aria-label="Loading standup">
      <div style={{ ...card, padding: space(1) }}>
        <div style={{ padding: `${space(0.5)}px ${space(1)}px ${space(1)}px` }}><Bar width={72} height={10} /></div>
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, padding: '6px 8px' }}>
            <div className="su-skeleton" style={{ width: 28, height: 28, borderRadius: '50%' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Bar width="70%" />
              <Bar width="45%" height={10} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: space(2) }}>
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: space(2), padding: `${space(2)}px ${space(3)}px` }}>
          <div className="su-skeleton" style={{ width: 44, height: 44, borderRadius: '50%' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Bar width={180} height={16} />
            <Bar width={280} />
          </div>
        </div>
        <div className="su-columns">
          {[5, 4, 2].map((rows, column) => (
            <div key={column} style={card}>
              <div style={{ padding: `${space(1.5)}px ${space(2)}px`, borderBottom: `1px solid ${C.divider}` }}><Bar width={90} height={14} /></div>
              <div style={{ padding: space(1), display: 'flex', flexDirection: 'column', gap: 2 }}>
                {Array.from({ length: rows }).map((_, index) => (
                  <div key={index} style={{ minHeight: 44, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
                    <Bar width="85%" />
                    <Bar width="50%" height={10} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
