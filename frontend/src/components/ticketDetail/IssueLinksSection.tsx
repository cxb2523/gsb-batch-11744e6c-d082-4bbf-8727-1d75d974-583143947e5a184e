import React from 'react';
import { Plus } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { ButtonCore } from '../ui';
import IssueLinkList from '../issue/IssueLinkList';
import { IssueLinkGrouped } from '../../lib/api/issue-links';

type LinkType = 'blocks' | 'is_blocked_by' | 'relates_to' | 'duplicates';
type LinkSearchResult = { id: number; key: string; title: string; type: string };
type LinkTarget = { id: number; key: string; title: string } | null;

interface IssueLinksSectionProps {
  issueLinks: IssueLinkGrouped;
  isAdmin: boolean;
  isMember: boolean;
  showAddLinkModal: boolean;
  setShowAddLinkModal: React.Dispatch<React.SetStateAction<boolean>>;
  linkSearchQuery: string;
  setLinkSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  linkSearchResults: LinkSearchResult[];
  setLinkSearchResults: React.Dispatch<React.SetStateAction<LinkSearchResult[]>>;
  linkSearchLoading: boolean;
  newLinkType: LinkType;
  setNewLinkType: React.Dispatch<React.SetStateAction<LinkType>>;
  selectedLinkTarget: LinkTarget;
  setSelectedLinkTarget: React.Dispatch<React.SetStateAction<LinkTarget>>;
  handleLinkSearch: (query: string) => void;
  handleAddLink: () => void;
  handleRemoveLink: (linkId: number) => Promise<void>;
  handleNavigateToIssue: (issueId: number) => void;
}

/** Issue-links section: grouped link lists plus the inline add-link search row. */
export function IssueLinksSection({
  issueLinks, isAdmin, isMember, showAddLinkModal, setShowAddLinkModal,
  linkSearchQuery, setLinkSearchQuery, linkSearchResults, setLinkSearchResults,
  linkSearchLoading, newLinkType, setNewLinkType, selectedLinkTarget, setSelectedLinkTarget,
  handleLinkSearch, handleAddLink, handleRemoveLink, handleNavigateToIssue,
}: IssueLinksSectionProps) {
  return (
                <div style={{ marginBottom: 40 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: tokens.colors.neutral[900] }}>
                      Issue Links
                    </h4>
                    {(isAdmin || isMember) && !showAddLinkModal && (
                      <ButtonCore
                        variant="secondary"
                        size="sm"
                        onClick={() => { setShowAddLinkModal(true); setLinkSearchQuery(''); setLinkSearchResults([]); setSelectedLinkTarget(null); }}
                        leftIcon={<Plus size={14} />}
                      >
                        Add link
                      </ButtonCore>
                    )}
                  </div>

                  {/* Add Link inline form */}
                  {showAddLinkModal && (
                    <div style={{ marginBottom: 16, padding: 12, border: `1px solid ${tokens.colors.neutral[200]}`, borderRadius: 8, background: tokens.colors.neutral[50] }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <select
                          value={newLinkType}
                          onChange={e => setNewLinkType(e.target.value as typeof newLinkType)}
                          style={{ fontSize: 13, padding: '5px 8px', border: `1px solid ${tokens.colors.neutral[300]}`, borderRadius: 4, background: '#fff', flexShrink: 0 }}
                        >
                          <option value="relates_to">Relates to</option>
                          <option value="blocks">Blocks</option>
                          <option value="is_blocked_by">Is blocked by</option>
                          <option value="duplicates">Duplicates</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Paste ticket key or search by title…"
                          value={linkSearchQuery}
                          onChange={e => handleLinkSearch(e.target.value)}
                          autoFocus
                          style={{ flex: 1, fontSize: 13, padding: '5px 10px', border: `1px solid ${tokens.colors.neutral[300]}`, borderRadius: 4, outline: 'none' }}
                        />
                      </div>

                      {/* Search results */}
                      {linkSearchLoading && <div style={{ fontSize: 12, color: tokens.colors.neutral[500], padding: '4px 0' }}>Searching…</div>}
                      {!linkSearchLoading && linkSearchResults.length > 0 && !selectedLinkTarget && (
                        <div style={{ border: `1px solid ${tokens.colors.neutral[200]}`, borderRadius: 4, background: '#fff', maxHeight: 180, overflowY: 'auto', marginBottom: 8 }}>
                          {linkSearchResults.map(r => (
                            <div
                              key={r.id}
                              onClick={() => { setSelectedLinkTarget(r); setLinkSearchQuery(`${r.key} — ${r.title}`); setLinkSearchResults([]); }}
                              style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}
                              onMouseEnter={e => e.currentTarget.style.background = tokens.colors.primary[50]}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <span style={{ fontWeight: 600, color: tokens.colors.primary[600], flexShrink: 0 }}>{r.key}</span>
                              <span style={{ color: tokens.colors.neutral[700], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {!linkSearchLoading && linkSearchQuery && linkSearchResults.length === 0 && !selectedLinkTarget && (
                        <div style={{ fontSize: 12, color: tokens.colors.neutral[400], padding: '4px 0' }}>No matching tickets found</div>
                      )}

                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <ButtonCore variant="secondary" size="sm" onClick={() => { setShowAddLinkModal(false); setSelectedLinkTarget(null); setLinkSearchQuery(''); setLinkSearchResults([]); }}>Cancel</ButtonCore>
                        <ButtonCore variant="primary" size="sm" onClick={handleAddLink} disabled={!selectedLinkTarget}>Add Link</ButtonCore>
                      </div>
                    </div>
                  )}

                  {issueLinks.blocks.length > 0 && (
                    <IssueLinkList
                      links={issueLinks.blocks}
                      linkType="blocks"
                      onRemoveLink={handleRemoveLink}
                      onIssueClick={handleNavigateToIssue}
                      canEdit={isAdmin || isMember}
                    />
                  )}

                  {issueLinks.blocked_by.length > 0 && (
                    <IssueLinkList
                      links={issueLinks.blocked_by}
                      linkType="blocked_by"
                      onRemoveLink={handleRemoveLink}
                      onIssueClick={handleNavigateToIssue}
                      canEdit={isAdmin || isMember}
                    />
                  )}

                  {issueLinks.relates_to.length > 0 && (
                    <IssueLinkList
                      links={issueLinks.relates_to}
                      linkType="relates_to"
                      onRemoveLink={handleRemoveLink}
                      onIssueClick={handleNavigateToIssue}
                      canEdit={isAdmin || isMember}
                    />
                  )}

                  {issueLinks.duplicates.length > 0 && (
                    <IssueLinkList
                      links={issueLinks.duplicates}
                      linkType="duplicates"
                      onRemoveLink={handleRemoveLink}
                      onIssueClick={handleNavigateToIssue}
                      canEdit={isAdmin || isMember}
                    />
                  )}

                  {issueLinks.duplicated_by.length > 0 && (
                    <IssueLinkList
                      links={issueLinks.duplicated_by}
                      linkType="duplicated_by"
                      onRemoveLink={handleRemoveLink}
                      onIssueClick={handleNavigateToIssue}
                      canEdit={isAdmin || isMember}
                    />
                  )}

                  {Object.values(issueLinks).every((links) => links.length === 0) && (
                    <div
                      style={{
                        padding: '16px',
                        textAlign: 'center',
                        color: tokens.colors.neutral[500],
                        fontSize: 13,
                        backgroundColor: tokens.colors.neutral[50],
                        borderRadius: 8,
                        border: `1px dashed ${tokens.colors.neutral[300]}`,
                      }}
                    >
                      No linked issues
                    </div>
                  )}

                  {/* Inline add-link row — low-friction, mirrors the subtasks quick-add;
                      clicking it reveals the link type + search form above. */}
                  {(isAdmin || isMember) && !showAddLinkModal && (
                    <button
                      onClick={() => { setShowAddLinkModal(true); setLinkSearchQuery(''); setLinkSearchResults([]); setSelectedLinkTarget(null); }}
                      style={{
                        marginTop: 8,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 12px',
                        border: `1px dashed ${tokens.colors.neutral[300]}`,
                        borderRadius: 6,
                        background: 'transparent',
                        color: tokens.colors.neutral[600],
                        fontSize: 13,
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = tokens.colors.neutral[50];
                        e.currentTarget.style.borderColor = tokens.colors.primary[400];
                        e.currentTarget.style.color = tokens.colors.primary[600];
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.borderColor = tokens.colors.neutral[300];
                        e.currentTarget.style.color = tokens.colors.neutral[600];
                      }}
                    >
                      <Plus size={14} />
                      Add link
                    </button>
                  )}
                </div>
  );
}
