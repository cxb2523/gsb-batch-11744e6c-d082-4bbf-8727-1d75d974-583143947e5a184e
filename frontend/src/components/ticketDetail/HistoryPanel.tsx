import React from 'react';
import { tokens } from '../../design-system/tokens';
import { TicketHistory } from '../../lib/api/tickets';

/** Read-only activity feed for the ticket's change history (History tab). */
export function HistoryPanel({ history }: { history: TicketHistory[] }) {
  return (
    <div
      style={{
        maxHeight: 600,
        overflowY: 'auto',
      }}
    >
      {history.length > 0 ? (
        history.map((entry, index) => (
          <div
            key={index}
            style={{
              padding: '16px',
              borderBottom: index < history.length - 1 ? `1px solid ${tokens.colors.neutral[200]}` : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor: tokens.colors.primary[100],
                  color: tokens.colors.primary[700],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {entry.changed_by?.name?.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: tokens.colors.neutral[900], fontSize: 14 }}>
                    {entry.changed_by?.name}
                  </span>
                  <span style={{ color: tokens.colors.neutral[500], fontSize: 13, marginLeft: 8 }}>
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: tokens.colors.neutral[700], lineHeight: 1.5 }}>
                  {entry.field && (
                    <>
                      changed <strong>{entry.field}</strong>
                      {entry.old_value && (
                        <>
                          {' '}from <span style={{ textDecoration: 'line-through', color: tokens.colors.neutral[500] }}>{entry.old_value}</span>
                        </>
                      )}
                      {entry.new_value && (
                        <>
                          {' '}to <strong>{entry.new_value}</strong>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))
      ) : (
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            color: tokens.colors.neutral[500],
            fontSize: 14,
          }}
        >
          No history available
        </div>
      )}
    </div>
  );
}
