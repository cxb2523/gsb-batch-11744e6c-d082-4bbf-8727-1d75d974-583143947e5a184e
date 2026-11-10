import React from 'react';
import { tokens } from '../../design-system/tokens';
import { sanitizeHtml } from '../../lib/sanitize';
import RichTextEditor from '../RichTextEditor';

interface DescriptionSectionProps {
  projectId: number;
  editDescription: string;
  setEditDescription: React.Dispatch<React.SetStateAction<string>>;
  editingDescription: boolean;
  setEditingDescription: React.Dispatch<React.SetStateAction<boolean>>;
  isAdmin: boolean;
  isMember: boolean;
}

/** The ticket description: inline prose that becomes a rich-text editor on click. */
export function DescriptionSection({ projectId, editDescription, setEditDescription, editingDescription, setEditingDescription, isAdmin, isMember }: DescriptionSectionProps) {
  return (
                <div style={{ marginBottom: 36 }}>
                  {editingDescription && (isAdmin || isMember) ? (
                    <div>
                      <RichTextEditor
                        projectId={projectId}
                        value={editDescription}
                        onChange={setEditDescription}
                        placeholder="Add a description… Use @ to mention team members"
                        style={{
                          width: '100%',
                          minHeight: 140,
                          padding: 12,
                          border: `1px solid ${tokens.colors.primary[400]}`,
                          borderRadius: 8,
                          fontSize: 15,
                          lineHeight: '1.65',
                          color: tokens.colors.neutral[900],
                          fontFamily: tokens.fontFamily.sans,
                          outline: 'none',
                        }}
                      />
                      <button
                        onClick={() => setEditingDescription(false)}
                        style={{
                          marginTop: 8,
                          padding: '5px 12px',
                          fontSize: 13,
                          fontWeight: 500,
                          color: tokens.colors.neutral[700],
                          background: tokens.colors.neutral[100],
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <div
                      className="td-prose"
                      role={isAdmin || isMember ? 'button' : undefined}
                      tabIndex={isAdmin || isMember ? 0 : undefined}
                      onClick={() => (isAdmin || isMember) && setEditingDescription(true)}
                      onKeyDown={(event) => {
                        if ((event.key === 'Enter' || event.key === ' ') && (isAdmin || isMember)) {
                          event.preventDefault();
                          setEditingDescription(true);
                        }
                      }}
                      style={{
                        minHeight: 44,
                        padding: '10px 12px',
                        marginLeft: -12,
                        borderRadius: 8,
                        fontSize: 15,
                        lineHeight: '1.65',
                        color: editDescription
                          ? tokens.colors.neutral[900]
                          : tokens.colors.neutral[500],
                        cursor: isAdmin || isMember ? 'text' : 'default',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {editDescription ? (
                        <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(editDescription) }} />
                      ) : (
                        'Add a description…'
                      )}
                    </div>
                  )}
                </div>
  );
}
