import React from 'react';
import { Code } from 'lucide-react';
import { Release } from '@/lib/api/releases';
import { EmptyState } from './EmptyState';
import { sectionHeadingStyle } from './styles';

interface CommitsTabProps {
  release: Release;
}

export function CommitsTab({ release }: CommitsTabProps) {
  return (
    <div>
      <h3 style={sectionHeadingStyle}>Git commits</h3>

      {release.commits && release.commits.length > 0 ? (
        <div style={{
          border: '1px solid #DFE1E6',
          borderRadius: 3,
          backgroundColor: '#FFFFFF',
        }}>
          {release.commits.map((commit, index) => (
            <div
              key={index}
              style={{
                padding: 12,
                borderBottom: index < release.commits!.length - 1 ? '1px solid #DFE1E6' : 'none',
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 4,
                gap: 12,
              }}>
                <div style={{
                  fontSize: 13,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontWeight: 500,
                  color: '#0052CC',
                }}>
                  {commit.hash.substring(0, 8)}
                </div>
                <div style={{
                  fontSize: 12,
                  color: '#6B778C',
                }}>
                  {new Date(commit.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
              </div>
              <div style={{
                fontSize: 13,
                color: '#172B4D',
                marginBottom: 4,
              }}>
                {commit.message}
              </div>
              <div style={{
                fontSize: 12,
                color: '#6B778C',
              }}>
                {commit.author}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Code size={28} />}
          title="No commits tracked"
          hint="Git commits will be displayed here when added to the release"
        />
      )}
    </div>
  );
}
