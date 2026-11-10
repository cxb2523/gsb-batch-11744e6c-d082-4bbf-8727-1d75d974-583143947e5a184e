import React from 'react';
import { FileText } from 'lucide-react';
import { Release } from '@/lib/api/releases';
import { Pill } from './Pill';
import { EmptyState } from './EmptyState';
import { getCategoryVisual } from './constants';
import { sectionHeadingStyle } from './styles';

interface ChangelogTabProps {
  release: Release;
}

export function ChangelogTab({ release }: ChangelogTabProps) {
  return (
    <div>
      <h3 style={sectionHeadingStyle}>Changelog</h3>

      {release.changelog_items && release.changelog_items.length > 0 ? (
        <div style={{
          border: '1px solid #DFE1E6',
          borderRadius: 3,
          backgroundColor: '#FFFFFF',
        }}>
          {release.changelog_items.map((item, index) => {
            const cv = getCategoryVisual(item.category);
            return (
              <div
                key={index}
                style={{
                  padding: 12,
                  borderBottom: index < release.changelog_items!.length - 1 ? '1px solid #DFE1E6' : 'none',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <Pill label={cv.label} color={cv.color} bg={cv.bg} small />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    color: '#172B4D',
                    marginBottom: 4,
                  }}>
                    {item.description}
                  </div>
                  {(item.ticket_key || item.commit_hash) && (
                    <div style={{
                      display: 'flex',
                      gap: 12,
                      fontSize: 12,
                      color: '#6B778C',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      flexWrap: 'wrap',
                    }}>
                      {item.ticket_key && (
                        <span>Ticket: <span style={{ color: '#0052CC' }}>{item.ticket_key}</span></span>
                      )}
                      {item.commit_hash && (
                        <span>Commit: <span style={{ color: '#0052CC' }}>{item.commit_hash.substring(0, 8)}</span></span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<FileText size={28} />}
          title="No changelog items"
          hint="Add changelog items to document changes in this release"
        />
      )}
    </div>
  );
}
