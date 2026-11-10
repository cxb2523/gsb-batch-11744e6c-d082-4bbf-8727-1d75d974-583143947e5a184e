'use client';

import React from 'react';
import { ExternalLink, X } from 'lucide-react';
import { IssueLink, getLinkTypeDisplay } from '../../lib/api/issue-links';
import { tokens } from '../../design-system/tokens';
import { LINK_TYPE_ICON } from './issueTypeMeta';

interface IssueLinkListProps {
  links: IssueLink[];
  linkType: 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates' | 'duplicated_by';
  onRemoveLink: (linkId: number) => Promise<void>;
  onIssueClick: (issueId: number) => void;
  canEdit: boolean;
}

const LINK_TYPE_COLORS: Record<string, string> = {
  blocks: tokens.colors.error[500],
  blocked_by: tokens.colors.warning[500],
  relates_to: tokens.colors.info[500],
  duplicates: tokens.colors.neutral[500],
  duplicated_by: tokens.colors.neutral[500],
};

export default function IssueLinkList({
  links,
  linkType,
  onRemoveLink,
  onIssueClick,
  canEdit,
}: IssueLinkListProps) {
  if (links.length === 0) return null;

  const handleRemove = async (linkId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to remove this link?')) return;

    try {
      await onRemoveLink(linkId);
    } catch (error) {
      console.error('Failed to remove link:', error);
      alert('Failed to remove link. Please try again.');
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
          fontSize: 13,
          fontWeight: 600,
          color: tokens.colors.neutral[700],
        }}
      >
        {(() => {
          const Icon = LINK_TYPE_ICON[linkType];
          return Icon ? (
            <Icon size={14} color={LINK_TYPE_COLORS[linkType] || tokens.colors.neutral[600]} />
          ) : null;
        })()}
        <span>{getLinkTypeDisplay(linkType)}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 400,
            color: tokens.colors.neutral[600],
          }}
        >
          ({links.length})
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {links.map((link) => (
          <div
            key={link.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '8px 12px',
              backgroundColor: tokens.colors.semantic.background.default,
              border: `1px solid ${tokens.colors.neutral[200]}`,
              borderLeft: `3px solid ${LINK_TYPE_COLORS[linkType]}`,
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onClick={() => onIssueClick(link.issue_id)}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = tokens.colors.neutral[50];
              e.currentTarget.style.borderColor = tokens.colors.neutral[300];
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = tokens.colors.semantic.background.default;
              e.currentTarget.style.borderColor = tokens.colors.neutral[200];
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: tokens.colors.neutral[900],
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    color: tokens.colors.primary[600],
                    fontSize: 13,
                  }}
                >
                  {link.issue_key}
                </span>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {link.issue_title}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: tokens.colors.neutral[600],
                  marginTop: 2,
                  textTransform: 'capitalize',
                }}
              >
                {link.issue_type}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {canEdit && (
                <button
                  onClick={(e) => handleRemove(link.id, e)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    color: tokens.colors.neutral[500],
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: 4,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = tokens.colors.error[50];
                    e.currentTarget.style.color = tokens.colors.error[600];
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = tokens.colors.neutral[500];
                  }}
                >
                  <X size={14} />
                </button>
              )}
              <ExternalLink size={14} color={tokens.colors.neutral[400]} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
