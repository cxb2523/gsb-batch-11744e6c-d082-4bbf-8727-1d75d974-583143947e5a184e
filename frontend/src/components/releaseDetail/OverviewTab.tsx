import React from 'react';
import { Search, ExternalLink } from 'lucide-react';
import { ButtonCore } from '@/components/ui';
import { Release, ReleaseTicket } from '@/lib/api/releases';
import { Pill } from './Pill';
import { RELEASE_STATUSES, EditFormData, getStatusVisual, getEnvVisual } from './constants';
import {
  sectionLabelStyle,
  sectionHeadingStyle,
  inputBaseStyle,
  secondaryBtn,
  dangerBtn,
  handleInputFocus,
  handleInputBlur,
} from './styles';

interface OverviewTabProps {
  release: Release;
  isEditMode: boolean;
  editFormData: EditFormData;
  setEditFormData: React.Dispatch<React.SetStateAction<EditFormData>>;
  isUpdatingStatus: boolean;
  isDeleting: boolean;
  handleStatusChange: (newStatus: string) => void;
  handleEdit: () => void;
  handleCancelEdit: () => void;
  handleSaveEdit: () => void;
  handleDelete: () => void;
  isLoadingTickets: boolean;
  showTickets: boolean;
  handleViewTickets: () => void;
  ticketSearchQuery: string;
  setTicketSearchQuery: (value: string) => void;
  filteredTickets: ReleaseTicket[];
  handleTicketClick: (ticketId: number) => void;
}

export function OverviewTab({
  release,
  isEditMode,
  editFormData,
  setEditFormData,
  isUpdatingStatus,
  isDeleting,
  handleStatusChange,
  handleEdit,
  handleCancelEdit,
  handleSaveEdit,
  handleDelete,
  isLoadingTickets,
  showTickets,
  handleViewTickets,
  ticketSearchQuery,
  setTicketSearchQuery,
  filteredTickets,
  handleTicketClick,
}: OverviewTabProps) {
  const statusVisual = getStatusVisual(release.status);

  return (
    <div>
      {/* Status row and actions */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <select
          value={release.status}
          onChange={(e) => handleStatusChange(e.target.value)}
          disabled={isUpdatingStatus || isEditMode}
          style={{
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 500,
            color: statusVisual.color,
            backgroundColor: statusVisual.bg,
            border: '1px solid #DFE1E6',
            borderRadius: 3,
            cursor: isUpdatingStatus || isEditMode ? 'not-allowed' : 'pointer',
            outline: 'none',
            fontFamily: 'var(--font-sans)',
            height: 30,
          }}
        >
          {RELEASE_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          {isEditMode ? (
            <>
              <button
                onClick={handleCancelEdit}
                disabled={isUpdatingStatus}
                style={secondaryBtn}
                onMouseEnter={(e) => {
                  if (!isUpdatingStatus) e.currentTarget.style.backgroundColor = '#F4F5F7';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Cancel
              </button>
              <ButtonCore variant="primary" onClick={handleSaveEdit} disabled={isUpdatingStatus}>
                {isUpdatingStatus ? 'Saving...' : 'Save changes'}
              </ButtonCore>
            </>
          ) : (
            <>
              <button
                onClick={handleEdit}
                style={secondaryBtn}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#F4F5F7';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                style={dangerBtn}
                onMouseEnter={(e) => {
                  if (!isDeleting) e.currentTarget.style.backgroundColor = '#BF2600';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#DE350B';
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12,
        marginBottom: 24,
      }}>
        {/* Tickets */}
        <div style={{
          padding: 12,
          backgroundColor: '#FFFFFF',
          border: '1px solid #DFE1E6',
          borderRadius: 3,
        }}>
          <div style={sectionLabelStyle}>Tickets</div>
          <div style={{
            fontSize: 18,
            fontWeight: 600,
            color: '#172B4D',
          }}>
            {release.ticket_count}
          </div>
        </div>

        {/* Release Date */}
        {(isEditMode || release.release_date) && (
          <div style={{
            padding: 12,
            backgroundColor: '#FFFFFF',
            border: '1px solid #DFE1E6',
            borderRadius: 3,
          }}>
            <div style={sectionLabelStyle}>Release date</div>
            {isEditMode ? (
              <input
                type="date"
                value={editFormData.release_date}
                onChange={(e) => setEditFormData({ ...editFormData, release_date: e.target.value })}
                style={inputBaseStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            ) : (
              <div style={{
                fontSize: 14,
                fontWeight: 500,
                color: '#172B4D',
              }}>
                {release.release_date
                  ? new Date(release.release_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Not set'}
              </div>
            )}
          </div>
        )}

        {/* Git Tag */}
        {(isEditMode || release.git_tag) && (
          <div style={{
            padding: 12,
            backgroundColor: '#FFFFFF',
            border: '1px solid #DFE1E6',
            borderRadius: 3,
          }}>
            <div style={sectionLabelStyle}>Git tag</div>
            {isEditMode ? (
              <input
                type="text"
                value={editFormData.git_tag}
                onChange={(e) => setEditFormData({ ...editFormData, git_tag: e.target.value })}
                placeholder="v1.0.0"
                style={{
                  ...inputBaseStyle,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            ) : (
              <div style={{
                fontSize: 13,
                fontWeight: 500,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: '#172B4D',
              }}>
                {release.git_tag || 'Not set'}
              </div>
            )}
          </div>
        )}

        {/* Git Branch */}
        {(isEditMode || release.git_branch) && (
          <div style={{
            padding: 12,
            backgroundColor: '#FFFFFF',
            border: '1px solid #DFE1E6',
            borderRadius: 3,
          }}>
            <div style={sectionLabelStyle}>Git branch</div>
            {isEditMode ? (
              <input
                type="text"
                value={editFormData.git_branch}
                onChange={(e) => setEditFormData({ ...editFormData, git_branch: e.target.value })}
                placeholder="main"
                style={{
                  ...inputBaseStyle,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            ) : (
              <div style={{
                fontSize: 13,
                fontWeight: 500,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: '#172B4D',
              }}>
                {release.git_branch || 'Not set'}
              </div>
            )}
          </div>
        )}

        {/* Git MR */}
        {(isEditMode || release.git_merge_mr) && (
          <div style={{
            padding: 12,
            backgroundColor: '#FFFFFF',
            border: '1px solid #DFE1E6',
            borderRadius: 3,
          }}>
            <div style={sectionLabelStyle}>Merge request</div>
            {isEditMode ? (
              <input
                type="url"
                value={editFormData.git_merge_mr}
                onChange={(e) => setEditFormData({ ...editFormData, git_merge_mr: e.target.value })}
                placeholder="https://..."
                style={inputBaseStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            ) : release.git_merge_mr ? (
              <a
                href={release.git_merge_mr}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#0052CC',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                View MR <ExternalLink size={12} />
              </a>
            ) : (
              <div style={{
                fontSize: 13,
                color: '#6B778C',
              }}>
                Not set
              </div>
            )}
          </div>
        )}
      </div>

      {/* Currently Deployed */}
      {release.current_environments && release.current_environments.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={sectionHeadingStyle}>Currently deployed to</h3>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {release.current_environments.map((env) => {
              const v = getEnvVisual(env);
              return <Pill key={env} label={v.label} color={v.color} bg={v.bg} />;
            })}
          </div>
        </div>
      )}

      {/* Description */}
      {(isEditMode || release.description) && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={sectionHeadingStyle}>Description</h3>
          {isEditMode ? (
            <textarea
              value={editFormData.description}
              onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              placeholder="Release description"
              rows={3}
              style={{
                ...inputBaseStyle,
                resize: 'vertical',
              }}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            />
          ) : (
            <p style={{
              fontSize: 14,
              color: '#42526E',
              lineHeight: 1.5,
              margin: 0,
            }}>
              {release.description || 'No description provided.'}
            </p>
          )}
        </div>
      )}

      {/* Release Notes */}
      {(isEditMode || release.release_notes) && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={sectionHeadingStyle}>Release notes</h3>
          {isEditMode ? (
            <textarea
              value={editFormData.release_notes}
              onChange={(e) => setEditFormData({ ...editFormData, release_notes: e.target.value })}
              placeholder="Release notes"
              rows={6}
              style={{
                ...inputBaseStyle,
                resize: 'vertical',
              }}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
            />
          ) : (
            <div style={{
              fontSize: 14,
              color: '#42526E',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}>
              {release.release_notes || 'No release notes provided.'}
            </div>
          )}
        </div>
      )}

      {/* Tickets */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}>
          <h3 style={{ ...sectionHeadingStyle, marginBottom: 0 }}>
            Tickets ({release.ticket_count})
          </h3>
          <button
            onClick={handleViewTickets}
            disabled={isLoadingTickets}
            style={{
              ...secondaryBtn,
              height: 30,
              padding: '6px 12px',
              fontSize: 13,
            }}
            onMouseEnter={(e) => {
              if (!isLoadingTickets) e.currentTarget.style.backgroundColor = '#F4F5F7';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {isLoadingTickets ? 'Loading...' : showTickets ? 'Hide tickets' : 'Show tickets'}
          </button>
        </div>

        {showTickets && (
          <div>
            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search
                size={14}
                color="#8993A4"
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                value={ticketSearchQuery}
                onChange={(e) => setTicketSearchQuery(e.target.value)}
                placeholder="Search tickets..."
                style={{
                  ...inputBaseStyle,
                  paddingLeft: 32,
                }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>

            {filteredTickets.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: 32,
                backgroundColor: '#FAFBFC',
                border: '1px solid #DFE1E6',
                borderRadius: 3,
                color: '#6B778C',
                fontSize: 13,
              }}>
                No tickets in this release
              </div>
            ) : (
              <div style={{
                border: '1px solid #DFE1E6',
                borderRadius: 3,
                backgroundColor: '#FFFFFF',
              }}>
                {filteredTickets.map((ticket, index) => (
                  <div
                    key={ticket.id}
                    onClick={() => handleTicketClick(ticket.id)}
                    style={{
                      padding: 12,
                      borderBottom: index < filteredTickets.length - 1 ? '1px solid #DFE1E6' : 'none',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 12,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#F4F5F7';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#FFFFFF';
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 4,
                      }}>
                        <span style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: '#0052CC',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        }}>
                          {ticket.key}
                        </span>
                      </div>
                      <div style={{
                        fontSize: 13,
                        color: '#172B4D',
                        marginBottom: 6,
                      }}>
                        {ticket.title}
                      </div>
                      <div style={{
                        display: 'flex',
                        gap: 6,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}>
                        <Pill label={ticket.type} color="#42526E" bg="#F4F5F7" small />
                        {ticket.story_points && (
                          <span style={{
                            fontSize: 11,
                            color: '#6B778C',
                          }}>
                            {ticket.story_points} pts
                          </span>
                        )}
                      </div>
                    </div>
                    <Pill
                      label={ticket.status.name}
                      color={ticket.status.color}
                      bg={`${ticket.status.color}1A`}
                      small
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
