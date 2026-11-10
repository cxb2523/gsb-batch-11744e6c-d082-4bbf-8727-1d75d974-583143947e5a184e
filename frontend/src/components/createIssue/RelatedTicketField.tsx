import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { tokens } from '../../design-system/tokens';

type Dispatch<T> = React.Dispatch<React.SetStateAction<T>>;

interface RelatedTicketFieldProps {
  relatedTicketId: number | null;
  setRelatedTicketId: Dispatch<number | null>;
  parentIssues: any[];
  showRelatedDropdown: boolean;
  setShowRelatedDropdown: Dispatch<boolean>;
  relatedDropdownRef: React.RefObject<HTMLDivElement | null>;
  setShowTypeDropdown: Dispatch<boolean>;
  setShowPriorityDropdown: Dispatch<boolean>;
  setShowAssigneeDropdown: Dispatch<boolean>;
  setShowEpicDropdown: Dispatch<boolean>;
  setShowLabelsDropdown: Dispatch<boolean>;
  setShowParentDropdown: Dispatch<boolean>;
  setShowSprintDropdown: Dispatch<boolean>;
}

/** Related-ticket picker (bugs only). */
export function RelatedTicketField(props: RelatedTicketFieldProps) {
  const {
    relatedTicketId, setRelatedTicketId, parentIssues, showRelatedDropdown, setShowRelatedDropdown, relatedDropdownRef,
    setShowTypeDropdown, setShowPriorityDropdown, setShowAssigneeDropdown,
    setShowEpicDropdown, setShowLabelsDropdown, setShowParentDropdown, setShowSprintDropdown,
  } = props;
  return (
          <div style={{ marginBottom: 24, position: 'relative' }} ref={relatedDropdownRef}>
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
              Related Ticket
            </label>
            <button
              onClick={() => {
                setShowRelatedDropdown(!showRelatedDropdown);
                if (!showRelatedDropdown) {
                  setShowTypeDropdown(false);
                  setShowPriorityDropdown(false);
                  setShowAssigneeDropdown(false);
                  setShowEpicDropdown(false);
                  setShowSprintDropdown(false);
                  setShowParentDropdown(false);
                  setShowLabelsDropdown(false);
                }
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: 'white',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                fontSize: 16,
                fontFamily: tokens.fontFamily.sans,
                color: relatedTicketId ? tokens.colors.semantic.text.primary : tokens.colors.semantic.text.tertiary,
              }}
            >
              <span>
                {(() => {
                  const related = parentIssues.find((p) => p.id === relatedTicketId);
                  return related ? `${related.key} — ${related.title}` : 'None (Optional)';
                })()}
              </span>
              <ChevronDown size={20} />
            </button>

            {showRelatedDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: 4,
                  backgroundColor: 'white',
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 1000,
                  maxHeight: 300,
                  overflowY: 'auto',
                }}
              >
                <button
                  onClick={() => {
                    setRelatedTicketId(null);
                    setShowRelatedDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    backgroundColor: relatedTicketId === null ? 'rgba(248,250,252,0.8)' : 'white',
                    border: 'none',
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontFamily: tokens.fontFamily.sans,
                    color: '#0a0a0a',
                  }}
                  onMouseEnter={(e) => {
                    if (relatedTicketId !== null) {
                      e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.5)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (relatedTicketId !== null) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  {relatedTicketId === null && <Check size={16} />}
                  <span>None</span>
                </button>
                {parentIssues.map((issue: any) => (
                  <button
                    key={issue.id}
                    onClick={() => {
                      setRelatedTicketId(issue.id);
                      setShowRelatedDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      backgroundColor: relatedTicketId === issue.id ? 'rgba(248,250,252,0.8)' : 'white',
                      border: 'none',
                      borderBottom: '1px solid rgba(0,0,0,0.05)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      cursor: 'pointer',
                      fontSize: 14,
                      fontFamily: tokens.fontFamily.sans,
                      color: '#0a0a0a',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      if (relatedTicketId !== issue.id) {
                        e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.5)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (relatedTicketId !== issue.id) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    {relatedTicketId === issue.id && <Check size={16} style={{ marginTop: 2 }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{issue.key}</div>
                      <div style={{ fontSize: 13, color: tokens.colors.neutral[600] }}>{issue.title}</div>
                    </div>
                  </button>
                ))}
                {parentIssues.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: tokens.colors.neutral[500], fontSize: 14 }}>
                    No tickets available to link.
                  </div>
                )}
              </div>
            )}
            {relatedTicketId && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: tokens.colors.neutral[500],
                  fontFamily: tokens.fontFamily.sans,
                }}
              >
                This bug will be linked as &quot;relates to&quot; the selected ticket
              </div>
            )}
          </div>
  );
}
