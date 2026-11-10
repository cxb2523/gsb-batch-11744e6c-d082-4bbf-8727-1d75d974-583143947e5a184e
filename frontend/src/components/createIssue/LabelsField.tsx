import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { ButtonCore } from '../ui';
import { Label } from '../../lib/api/settings';

interface LabelsFieldProps {
  labels: Label[];
  selectedLabelIds: number[];
  setSelectedLabelIds: React.Dispatch<React.SetStateAction<number[]>>;
  creatingNewLabel: boolean;
  setCreatingNewLabel: React.Dispatch<React.SetStateAction<boolean>>;
  newLabelName: string;
  setNewLabelName: React.Dispatch<React.SetStateAction<string>>;
  newLabelColor: string;
  setNewLabelColor: React.Dispatch<React.SetStateAction<string>>;
  showLabelsDropdown: boolean;
  setShowLabelsDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  labelsDropdownRef: React.RefObject<HTMLDivElement | null>;
  handleCreateLabel: () => void;
  setShowTypeDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPriorityDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAssigneeDropdown: React.Dispatch<React.SetStateAction<boolean>>;
  setShowEpicDropdown: React.Dispatch<React.SetStateAction<boolean>>;
}

/** Labels multi-select for the create-issue form, with inline "create label". */
export function LabelsField({
  labels, selectedLabelIds, setSelectedLabelIds,
  creatingNewLabel, setCreatingNewLabel, newLabelName, setNewLabelName,
  newLabelColor, setNewLabelColor, showLabelsDropdown, setShowLabelsDropdown,
  labelsDropdownRef, handleCreateLabel,
  setShowTypeDropdown, setShowPriorityDropdown, setShowAssigneeDropdown, setShowEpicDropdown,
}: LabelsFieldProps) {
  return (
          <div style={{ position: 'relative', minWidth: 0 }} ref={labelsDropdownRef}>
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
              Labels
            </label>
            <button
              onClick={() => {
                setShowLabelsDropdown(!showLabelsDropdown);
                if (!showLabelsDropdown) {
                  // Close other dropdowns
                  setShowTypeDropdown(false);
                  setShowPriorityDropdown(false);
                  setShowAssigneeDropdown(false);
                  setShowEpicDropdown(false);
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
                fontSize: 14,
                fontFamily: tokens.fontFamily.sans,
                color: selectedLabelIds.length > 0 ? '#0a0a0a' : '#9ca3af',
                transition: 'all 150ms ease',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  alignItems: 'center',
                  minWidth: 0,
                  overflow: 'hidden',
                }}
              >
                {selectedLabelIds.length === 0 && <span>Select labels</span>}
                {selectedLabelIds.length > 0 &&
                  labels
                    .filter((label) => selectedLabelIds.includes(label.id))
                    .map((label) => (
                      <span
                        key={label.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: '1px solid rgba(0,0,0,0.06)',
                          backgroundColor: label.color || '#f3f4f6',
                          fontSize: 12,
                          color: '#0a0a0a',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label.name}
                      </span>
                    ))}
              </div>
              <ChevronDown size={18} style={{ flexShrink: 0 }} />
            </button>

            {showLabelsDropdown && (
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
                  maxHeight: 260,
                  overflowY: 'auto',
                }}
              >
                {labels.map((label) => {
                  const isSelected = selectedLabelIds.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      onClick={() => {
                        setSelectedLabelIds((prev) =>
                          isSelected
                            ? prev.filter((id) => id !== label.id)
                            : [...prev, label.id],
                        );
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: isSelected ? 'rgba(248,250,252,0.8)' : 'white',
                        border: 'none',
                        borderBottom: '1px solid rgba(0,0,0,0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        fontSize: 14,
                        fontFamily: tokens.fontFamily.sans,
                        color: '#0a0a0a',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.6)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.backgroundColor = 'white';
                        }
                      }}
                    >
                      {isSelected && <Check size={14} />}
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: label.color || '#6b7280',
                          flexShrink: 0,
                        }}
                      />
                      <span>{label.name}</span>
                    </button>
                  );
                })}

                {/* Create New Label Section */}
                {!creatingNewLabel && (
                  <button
                    onClick={() => setCreatingNewLabel(true)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: 'white',
                      border: 'none',
                      borderTop: labels.length > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      fontSize: 14,
                      fontFamily: tokens.fontFamily.sans,
                      color: tokens.colors.primary[600],
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                    }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
                    <span>Create new label</span>
                  </button>
                )}

                {creatingNewLabel && (
                  <div
                    style={{
                      padding: 12,
                      borderTop: labels.length > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none',
                      backgroundColor: '#f9fafb',
                    }}
                  >
                    <div style={{ marginBottom: 8 }}>
                      <input
                        type="text"
                        placeholder="Label name"
                        value={newLabelName}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCreateLabel();
                          } else if (e.key === 'Escape') {
                            setCreatingNewLabel(false);
                            setNewLabelName('');
                            setNewLabelColor('#3b82f6');
                          }
                        }}
                        autoFocus
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid rgba(0,0,0,0.1)',
                          borderRadius: 6,
                          fontSize: 14,
                          fontFamily: tokens.fontFamily.sans,
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <label
                        style={{
                          fontSize: 13,
                          color: tokens.colors.neutral[600],
                          fontFamily: tokens.fontFamily.sans,
                        }}
                      >
                        Color:
                      </label>
                      <input
                        type="color"
                        value={newLabelColor}
                        onChange={(e) => setNewLabelColor(e.target.value)}
                        style={{
                          width: 40,
                          height: 28,
                          border: '1px solid rgba(0,0,0,0.1)',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      />
                      <div
                        style={{
                          flex: 1,
                          height: 28,
                          backgroundColor: newLabelColor,
                          borderRadius: 4,
                          border: '1px solid rgba(0,0,0,0.1)',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <ButtonCore variant="primary" size="sm" onClick={handleCreateLabel} disabled={!newLabelName.trim()} style={{ flex: 1 }}>
                        Create
                      </ButtonCore>
                      <ButtonCore
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setCreatingNewLabel(false);
                          setNewLabelName('');
                          setNewLabelColor('#3b82f6');
                        }}
                        style={{ flex: 1 }}
                      >
                        Cancel
                      </ButtonCore>
                    </div>
                  </div>
                )}

                {labels.length === 0 && !creatingNewLabel && (
                  <div
                    style={{
                      padding: '10px 12px',
                      fontSize: 13,
                      color: tokens.colors.semantic.text.tertiary,
                      textAlign: 'center',
                    }}
                  >
                    No labels yet.
                  </div>
                )}
              </div>
            )}
          </div>
  );
}
