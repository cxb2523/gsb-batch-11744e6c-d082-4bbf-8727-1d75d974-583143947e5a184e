import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { tokens } from '../../design-system/tokens';

type Dispatch<T> = React.Dispatch<React.SetStateAction<T>>;

interface ParentIssueSectionProps {
  parentId: number | null;
  setParentId: Dispatch<number | null>;
  parentIssues: any[];
  parentSearch: string;
  setParentSearch: Dispatch<string>;
  loadingParents: boolean;
  parentCursor: string | null;
  parentTotal: number;
  loadingMoreParents: boolean;
  chosenParent: { id: number; key: string } | null;
  setChosenParent: Dispatch<{ id: number; key: string } | null>;
  showParentDropdown: boolean;
  setShowParentDropdown: Dispatch<boolean>;
  parentDropdownRef: React.RefObject<HTMLDivElement | null>;
  parentSearchRef: React.RefObject<HTMLInputElement | null>;
  loadMoreParents: () => void;
  setShowTypeDropdown: Dispatch<boolean>;
  setShowPriorityDropdown: Dispatch<boolean>;
  setShowAssigneeDropdown: Dispatch<boolean>;
  setShowEpicDropdown: Dispatch<boolean>;
  setShowLabelsDropdown: Dispatch<boolean>;
  setShowSprintDropdown: Dispatch<boolean>;
}

/** Parent-issue picker (subtasks only): searchable paginated dropdown. */
export function ParentIssueSection(props: ParentIssueSectionProps) {
  const {
    parentId, setParentId, parentIssues, parentSearch, setParentSearch, loadingParents,
    parentCursor, parentTotal, loadingMoreParents, chosenParent, setChosenParent,
    showParentDropdown, setShowParentDropdown, parentDropdownRef, parentSearchRef, loadMoreParents,
    setShowTypeDropdown, setShowPriorityDropdown, setShowAssigneeDropdown,
    setShowEpicDropdown, setShowLabelsDropdown, setShowSprintDropdown,
  } = props;
  return (
          <div style={{ marginBottom: 24, position: 'relative' }} ref={parentDropdownRef}>
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
              Parent Issue <span style={{ color: '#e00' }}>*</span>
            </label>
            <button
              onClick={() => {
                setShowParentDropdown(!showParentDropdown);
                if (!showParentDropdown) {
                  setShowTypeDropdown(false);
                  setShowPriorityDropdown(false);
                  setShowAssigneeDropdown(false);
                  setShowEpicDropdown(false);
                  setShowSprintDropdown(false);
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
                color: parentId ? tokens.colors.semantic.text.primary : tokens.colors.semantic.text.tertiary,
              }}
            >
              <span>{chosenParent?.key || 'Select Parent Issue'}</span>
              <ChevronDown size={20} />
            </button>

            {showParentDropdown && (
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
                <div style={{ position: 'relative' }}>
                  <input
                    ref={parentSearchRef}
                    autoFocus
                    value={parentSearch}
                    onChange={(e) => setParentSearch(e.target.value)}
                    placeholder="Search by key or title..."
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 32px 10px 14px',
                      border: 'none',
                      borderBottom: '1px solid rgba(0,0,0,0.1)',
                      fontSize: 14,
                      fontFamily: tokens.fontFamily.sans,
                      outline: 'none',
                    }}
                  />
                  {parentSearch && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => {
                        setParentSearch('');
                        parentSearchRef.current?.focus();
                      }}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        padding: 4,
                        cursor: 'pointer',
                        fontSize: 13,
                        lineHeight: 1,
                        color: tokens.colors.semantic.text.tertiary,
                      }}
                    >
                      &#10005;
                    </button>
                  )}
                </div>
                {loadingParents && (
                  <div style={{ padding: '10px 14px', fontSize: 13, color: tokens.colors.semantic.text.tertiary }}>
                    Searching...
                  </div>
                )}
                {!loadingParents && parentIssues.length === 0 && (
                  <div style={{ padding: '10px 14px', fontSize: 13, color: tokens.colors.semantic.text.tertiary }}>
                    {parentSearch ? 'No issues match that search' : 'No issues available'}
                  </div>
                )}
                {parentIssues.map((issue: any) => (
                  <button
                    key={issue.id}
                    onClick={() => {
                      setParentId(issue.id);
                      // Remembered separately: the results list moves on as the
                      // search changes, but the chosen parent must stay named.
                      setChosenParent({ id: issue.id, key: issue.key });
                      setShowParentDropdown(false);
                      setParentSearch('');
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      backgroundColor: parentId === issue.id ? 'rgba(248,250,252,0.8)' : 'white',
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
                      if (parentId !== issue.id) {
                        e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.5)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (parentId !== issue.id) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    {parentId === issue.id && <Check size={16} style={{ marginTop: 2 }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{issue.key}</div>
                      <div style={{ fontSize: 13, color: tokens.colors.neutral[600] }}>{issue.title}</div>
                    </div>
                  </button>
                ))}

                {parentCursor && (
                  <button
                    type="button"
                    onClick={loadMoreParents}
                    disabled={loadingMoreParents}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'white',
                      border: 'none',
                      borderTop: '1px solid rgba(0,0,0,0.08)',
                      fontSize: 13,
                      fontWeight: 600,
                      color: tokens.colors.semantic.text.secondary,
                      cursor: loadingMoreParents ? 'default' : 'pointer',
                      textAlign: 'center',
                      fontFamily: tokens.fontFamily.sans,
                    }}
                  >
                    {loadingMoreParents
                      ? 'Loading...'
                      : `Load more (${parentIssues.length} of ${parentTotal})`}
                  </button>
                )}
              </div>
            )}
          </div>
  );
}
