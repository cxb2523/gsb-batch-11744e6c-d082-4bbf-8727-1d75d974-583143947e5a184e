import React from 'react';
import { Check, ChevronDown, Sparkles, TrendingUp } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { ProjectMember, Label } from '../../lib/api/settings';
import { EpicListItem } from '../../lib/api/epics';
import { RecommendationResult, Skill } from '../../lib/api/skills';
import { PRIORITIES } from './constants';
import { Priority, PriorityValue } from './types';
import { LabelsField } from './LabelsField';

type Dispatch<T> = React.Dispatch<React.SetStateAction<T>>;
type DivRef = React.RefObject<HTMLDivElement | null>;

interface PriorityAssigneeRowProps {
  type: string;
  priority: PriorityValue;
  setPriority: Dispatch<PriorityValue>;
  assigneeId: number | null;
  setAssigneeId: Dispatch<number | null>;
  epicId: number | null;
  setEpicId: Dispatch<number | null>;
  members: ProjectMember[];
  epics: EpicListItem[];
  labels: Label[];
  selectedLabelIds: number[];
  setSelectedLabelIds: Dispatch<number[]>;
  creatingNewLabel: boolean;
  setCreatingNewLabel: Dispatch<boolean>;
  newLabelName: string;
  setNewLabelName: Dispatch<string>;
  newLabelColor: string;
  setNewLabelColor: Dispatch<string>;
  showPriorityDropdown: boolean;
  setShowPriorityDropdown: Dispatch<boolean>;
  showAssigneeDropdown: boolean;
  setShowAssigneeDropdown: Dispatch<boolean>;
  showEpicDropdown: boolean;
  setShowEpicDropdown: Dispatch<boolean>;
  showLabelsDropdown: boolean;
  setShowLabelsDropdown: Dispatch<boolean>;
  showRecommendations: boolean;
  setShowRecommendations: Dispatch<boolean>;
  assigneeSearchTerm: string;
  setAssigneeSearchTerm: Dispatch<string>;
  recommendations: RecommendationResult[];
  loadingRecommendations: boolean;
  availableSkills: Skill[];
  selectedSkillFilters: number[];
  setSelectedSkillFilters: Dispatch<number[]>;
  priorityDropdownRef: DivRef;
  assigneeDropdownRef: DivRef;
  epicDropdownRef: DivRef;
  labelsDropdownRef: DivRef;
  handleCreateLabel: () => void;
  setShowTypeDropdown: Dispatch<boolean>;
  setShowParentDropdown: Dispatch<boolean>;
  setShowSprintDropdown: Dispatch<boolean>;
  selectedPriority: Priority;
  selectedAssignee: ProjectMember | undefined;
  filteredMembers: ProjectMember[];
}

/** Priority + Assignee (with skill filters & skill-based recommendations) + Labels + Epic
 *  row of the create-issue form. */
export function PriorityAssigneeRow(props: PriorityAssigneeRowProps) {
  const {
    type, priority, setPriority, assigneeId, setAssigneeId, epicId, setEpicId,
    members, epics, labels, selectedLabelIds, setSelectedLabelIds,
    creatingNewLabel, setCreatingNewLabel, newLabelName, setNewLabelName, newLabelColor, setNewLabelColor,
    showPriorityDropdown, setShowPriorityDropdown, showAssigneeDropdown, setShowAssigneeDropdown,
    showEpicDropdown, setShowEpicDropdown, showLabelsDropdown, setShowLabelsDropdown,
    showRecommendations, setShowRecommendations, assigneeSearchTerm, setAssigneeSearchTerm,
    recommendations, loadingRecommendations, availableSkills, selectedSkillFilters, setSelectedSkillFilters,
    priorityDropdownRef, assigneeDropdownRef, epicDropdownRef, labelsDropdownRef, handleCreateLabel,
    setShowTypeDropdown, setShowParentDropdown, setShowSprintDropdown,
    selectedPriority, selectedAssignee, filteredMembers,
  } = props;
  return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24, minWidth: 0 }}>
          {/* Priority */}
          <div style={{ position: 'relative', minWidth: 0 }} ref={priorityDropdownRef}>
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
              Priority <span style={{ color: '#e00' }}>*</span>
            </label>
            <button
              onClick={() => {
                setShowPriorityDropdown(!showPriorityDropdown);
                if (!showPriorityDropdown) {
                  // Close other dropdowns
                  setShowTypeDropdown(false);
                  setShowAssigneeDropdown(false);
                  setShowEpicDropdown(false);
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
                color: '#0a0a0a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: selectedPriority.color,
                  }}
                />
                <span>{selectedPriority.label}</span>
              </div>
              <ChevronDown size={20} />
            </button>

            {showPriorityDropdown && (
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
                }}
              >
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => {
                      setPriority(p.value);
                      setShowPriorityDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      backgroundColor: priority === p.value ? 'rgba(248,250,252,0.8)' : 'white',
                      border: 'none',
                      borderBottom: '1px solid rgba(0,0,0,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      fontSize: 16,
                      fontFamily: tokens.fontFamily.sans,
                      color: '#0a0a0a',
                    }}
                    onMouseEnter={(e) => {
                      if (priority !== p.value) {
                        e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.5)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (priority !== p.value) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    {priority === p.value && <Check size={16} />}
                    <div
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        backgroundColor: p.color,
                      }}
                    />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Assignee */}
          <div style={{ position: 'relative' }} ref={assigneeDropdownRef}>
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
              Assignee
            </label>
            <button
              onClick={() => {
                setShowAssigneeDropdown(!showAssigneeDropdown);
                if (!showAssigneeDropdown) {
                  setAssigneeSearchTerm(''); // Clear search when opening
                  // Close other dropdowns
                  setShowTypeDropdown(false);
                  setShowPriorityDropdown(false);
                  setShowEpicDropdown(false);
                  setShowSprintDropdown(false);
                  setShowParentDropdown(false);
                  setShowLabelsDropdown(false);
                } else {
                  setAssigneeSearchTerm(''); // Clear search when closing
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
                color: assigneeId ? tokens.colors.semantic.text.primary : tokens.colors.semantic.text.tertiary,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1, textAlign: 'left' }}>{selectedAssignee?.name || 'Unassigned'}</span>
              <ChevronDown size={20} />
            </button>

            {showAssigneeDropdown && (
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
                  maxHeight: 400,
                  overflowY: 'auto',
                }}
              >
                {/* Skill Filters */}
                {availableSkills.length > 0 && (
                  <div
                    style={{
                      padding: 12,
                      borderBottom: '1px solid rgba(0,0,0,0.1)',
                      backgroundColor: tokens.colors.neutral[50],
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: tokens.colors.neutral[700],
                        marginBottom: 8,
                        fontFamily: tokens.fontFamily.sans,
                      }}
                    >
                      Filter by Skills
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {availableSkills.slice(0, 12).map((skill) => {
                        const isSelected = selectedSkillFilters.includes(skill.id);
                        return (
                          <button
                            key={skill.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSkillFilters(prev =>
                                isSelected
                                  ? prev.filter(id => id !== skill.id)
                                  : [...prev, skill.id]
                              );
                            }}
                            style={{
                              fontSize: 11,
                              padding: '4px 8px',
                              backgroundColor: isSelected
                                ? tokens.colors.primary[500]
                                : 'white',
                              color: isSelected
                                ? 'white'
                                : tokens.colors.neutral[700],
                              border: `1px solid ${isSelected ? tokens.colors.primary[500] : tokens.colors.neutral[300]}`,
                              borderRadius: 4,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              fontWeight: 500,
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.backgroundColor = tokens.colors.neutral[100];
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.backgroundColor = 'white';
                              }
                            }}
                          >
                            {skill.name}
                          </button>
                        );
                      })}
                      {selectedSkillFilters.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSkillFilters([]);
                          }}
                          style={{
                            fontSize: 11,
                            padding: '4px 8px',
                            backgroundColor: 'transparent',
                            color: tokens.colors.error[600],
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 600,
                            textDecoration: 'underline',
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {selectedSkillFilters.length > 0 && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 11,
                          color: tokens.colors.neutral[600],
                        }}
                      >
                        Showing {filteredMembers.length} of {members.length} members
                      </div>
                    )}
                  </div>
                )}

                {/* Search Input */}
                <div
                  style={{
                    padding: 12,
                    borderBottom: '1px solid rgba(0,0,0,0.1)',
                    backgroundColor: 'white',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={assigneeSearchTerm}
                    onChange={(e) => setAssigneeSearchTerm(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: 14,
                      border: '1px solid rgba(0,0,0,0.1)',
                      borderRadius: 6,
                      outline: 'none',
                      fontFamily: tokens.fontFamily.sans,
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = tokens.colors.primary[500];
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(0,0,0,0.1)';
                    }}
                  />
                  {assigneeSearchTerm && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        color: tokens.colors.neutral[600],
                      }}
                    >
                      Found {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setAssigneeId(null);
                    setShowAssigneeDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    backgroundColor: assigneeId === null ? 'rgba(248,250,252,0.8)' : 'white',
                    border: 'none',
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    fontSize: 16,
                    fontFamily: tokens.fontFamily.sans,
                    color: '#0a0a0a',
                  }}
                  onMouseEnter={(e) => {
                    if (assigneeId !== null) {
                      e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.5)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (assigneeId !== null) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  {assigneeId === null && <Check size={16} />}
                  <span>Unassigned</span>
                </button>
                {filteredMembers.map((member) => (
                  <button
                    key={member.user_id}
                    onClick={() => {
                      setAssigneeId(member.user_id);
                      setShowAssigneeDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      backgroundColor: assigneeId === member.user_id ? 'rgba(248,250,252,0.8)' : 'white',
                      border: 'none',
                      borderBottom: '1px solid rgba(0,0,0,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      fontSize: 16,
                      fontFamily: tokens.fontFamily.sans,
                      color: '#0a0a0a',
                    }}
                    onMouseEnter={(e) => {
                      if (assigneeId !== member.user_id) {
                        e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.5)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (assigneeId !== member.user_id) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    {assigneeId === member.user_id && <Check size={16} />}
                    <span>{member.name}</span>
                  </button>
                ))}
                {filteredMembers.length === 0 && selectedSkillFilters.length > 0 && (
                  <div
                    style={{
                      padding: 20,
                      textAlign: 'center',
                      color: tokens.colors.neutral[500],
                      fontSize: 14,
                    }}
                  >
                    No members match the selected skills
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Developer Recommendations */}
          {showRecommendations && recommendations.length > 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                marginTop: 16,
                padding: 16,
                backgroundColor: tokens.colors.primary[50],
                borderRadius: 8,
                border: `1px solid ${tokens.colors.primary[200]}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} color={tokens.colors.primary[600]} />
                  <h4
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 600,
                      color: tokens.colors.primary[700],
                      fontFamily: tokens.fontFamily.sans,
                    }}
                  >
                    Recommended Developers
                  </h4>
                </div>
                <button
                  onClick={() => setShowRecommendations(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                    color: tokens.colors.neutral[500],
                    fontSize: 12,
                  }}
                >
                  Dismiss
                </button>
              </div>

              {loadingRecommendations ? (
                <div
                  style={{
                    padding: 20,
                    textAlign: 'center',
                    color: tokens.colors.neutral[500],
                    fontSize: 14,
                  }}
                >
                  Finding best matches...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recommendations.slice(0, 5).map((rec) => (
                    <button
                      key={rec.user_id}
                      onClick={() => {
                        setAssigneeId(rec.user_id);
                        setShowRecommendations(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: 12,
                        backgroundColor: 'white',
                        border: `1px solid ${tokens.colors.neutral[200]}`,
                        borderRadius: 6,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        textAlign: 'left',
                        width: '100%',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = tokens.colors.primary[400];
                        e.currentTarget.style.backgroundColor = tokens.colors.primary[50];
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = tokens.colors.neutral[200];
                        e.currentTarget.style.backgroundColor = 'white';
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: tokens.colors.semantic.text.primary,
                                fontFamily: tokens.fontFamily.sans,
                              }}
                            >
                              {rec.name}
                            </span>
                            {rec.designation && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: tokens.colors.primary[600],
                                  fontWeight: 500,
                                }}
                              >
                                {rec.designation}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <TrendingUp size={14} color={tokens.colors.success[600]} />
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: tokens.colors.success[700],
                              }}
                            >
                              {Math.round(rec.match_score)}%
                            </span>
                          </div>
                        </div>

                        {rec.matching_skills.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {rec.matching_skills.map((skill) => (
                              <span
                                key={skill}
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  backgroundColor: tokens.colors.primary[100],
                                  color: tokens.colors.primary[700],
                                  borderRadius: 4,
                                  fontWeight: 500,
                                }}
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            fontSize: 12,
                            color: tokens.colors.neutral[600],
                          }}
                        >
                          <span>
                            Workload: <strong>{rec.current_workload}</strong> tickets
                          </span>
                          <span>•</span>
                          <span
                            style={{
                              color:
                                rec.availability_status === 'available'
                                  ? tokens.colors.success[600]
                                  : rec.availability_status === 'busy'
                                  ? tokens.colors.warning[600]
                                  : tokens.colors.error[600],
                              fontWeight: 500,
                            }}
                          >
                            {rec.availability_status.charAt(0).toUpperCase() +
                              rec.availability_status.slice(1)}
                          </span>
                          <span>•</span>
                          <span
                            style={{
                              color:
                                rec.proficiency_level === 'expert'
                                  ? tokens.colors.success[600]
                                  : rec.proficiency_level === 'intermediate'
                                  ? tokens.colors.primary[600]
                                  : tokens.colors.neutral[600],
                              fontWeight: 500,
                            }}
                          >
                            {rec.proficiency_level.charAt(0).toUpperCase() +
                              rec.proficiency_level.slice(1)}
                          </span>
                        </div>

                        <p
                          style={{
                            margin: 0,
                            fontSize: 12,
                            color: tokens.colors.neutral[600],
                            fontStyle: 'italic',
                          }}
                        >
                          {rec.reason}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Labels */}
          <LabelsField
            labels={labels}
            selectedLabelIds={selectedLabelIds}
            setSelectedLabelIds={setSelectedLabelIds}
            creatingNewLabel={creatingNewLabel}
            setCreatingNewLabel={setCreatingNewLabel}
            newLabelName={newLabelName}
            setNewLabelName={setNewLabelName}
            newLabelColor={newLabelColor}
            setNewLabelColor={setNewLabelColor}
            showLabelsDropdown={showLabelsDropdown}
            setShowLabelsDropdown={setShowLabelsDropdown}
            labelsDropdownRef={labelsDropdownRef}
            handleCreateLabel={handleCreateLabel}
            setShowTypeDropdown={setShowTypeDropdown}
            setShowPriorityDropdown={setShowPriorityDropdown}
            setShowAssigneeDropdown={setShowAssigneeDropdown}
            setShowEpicDropdown={setShowEpicDropdown}
          />

          {/* Epic - Hidden for Epic type */}
          {type !== 'epic' && (
          <div style={{ position: 'relative' }} ref={epicDropdownRef}>
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
              Epic
            </label>
            <button
              onClick={() => {
                setShowEpicDropdown(!showEpicDropdown);
                if (!showEpicDropdown) {
                  // Close other dropdowns
                  setShowTypeDropdown(false);
                  setShowPriorityDropdown(false);
                  setShowAssigneeDropdown(false);
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
                color: epicId ? tokens.colors.semantic.text.primary : tokens.colors.semantic.text.tertiary,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1, textAlign: 'left' }}>{epics.find(e => e.id === epicId)?.title || 'No Epic'}</span>
              <ChevronDown size={20} />
            </button>

            {showEpicDropdown && (
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
                  maxHeight: 250,
                  overflowY: 'auto',
                }}
              >
                <button
                  onClick={() => {
                    setEpicId(null);
                    setShowEpicDropdown(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    backgroundColor: epicId === null ? 'rgba(248,250,252,0.8)' : 'white',
                    border: 'none',
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    fontSize: 16,
                    fontFamily: tokens.fontFamily.sans,
                    color: '#0a0a0a',
                  }}
                  onMouseEnter={(e) => {
                    if (epicId !== null) {
                      e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.5)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (epicId !== null) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  {epicId === null && <Check size={16} />}
                  <span>No Epic</span>
                </button>
                {epics.map((epic) => (
                  <button
                    key={epic.id}
                    onClick={() => {
                      setEpicId(epic.id);
                      setShowEpicDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      backgroundColor: epicId === epic.id ? 'rgba(248,250,252,0.8)' : 'white',
                      border: 'none',
                      borderBottom: '1px solid rgba(0,0,0,0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      fontSize: 16,
                      fontFamily: tokens.fontFamily.sans,
                      color: '#0a0a0a',
                    }}
                    onMouseEnter={(e) => {
                      if (epicId !== epic.id) {
                        e.currentTarget.style.backgroundColor = 'rgba(248,250,252,0.5)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (epicId !== epic.id) {
                        e.currentTarget.style.backgroundColor = 'white';
                      }
                    }}
                  >
                    {epicId === epic.id && <Check size={16} />}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 2,
                          backgroundColor: epic.color,
                        }}
                      />
                      <span>{epic.title}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
        </div>
  );
}
