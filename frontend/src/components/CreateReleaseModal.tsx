'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createRelease, CreateReleaseData } from '@/lib/api/releases';
import { ticketsAPI } from '@/lib/api/tickets';
import { epicsApi, EpicListItem } from '@/lib/api/epics';
import { X, Search } from 'lucide-react';
import { ButtonCore } from '@/components/ui';

interface CreateReleaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onReleaseCreated?: () => void;
}

interface Ticket {
  id: number;
  key: string;
  title: string;
  status_name?: string;
  epic_id?: number;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#6B778C',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: 6,
};

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 14,
  color: '#172B4D',
  backgroundColor: '#FAFBFC',
  border: '1px solid #DFE1E6',
  borderRadius: 3,
  outline: 'none',
  fontFamily: 'var(--font-sans)',
  transition: 'background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
};

const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.currentTarget.style.backgroundColor = '#FFFFFF';
  e.currentTarget.style.borderColor = '#4C9AFF';
  e.currentTarget.style.boxShadow = '0 0 0 2px #DEEBFF';
};

const handleInputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.currentTarget.style.backgroundColor = '#FAFBFC';
  e.currentTarget.style.borderColor = '#DFE1E6';
  e.currentTarget.style.boxShadow = 'none';
};

/** How many matches the ticket search returns; a picker finds, it does not list. */
const PICKER_PAGE_SIZE = 20;

/** Epics have their own section in this modal, so they stay out of the ticket list. */
const RELEASABLE_TYPES = ['story', 'task', 'bug', 'campaign', 'design', 'engineering'];

/** A version may contain only letters, digits and dots - no other special characters. */
const VERSION_ALLOWED = /^[A-Za-z0-9.]+$/;

export const CreateReleaseModal: React.FC<CreateReleaseModalProps> = ({
  isOpen,
  onClose,
  projectId,
  onReleaseCreated,
}) => {
  const [formData, setFormData] = useState<CreateReleaseData>({
    name: '',
    version: '',
    description: '',
    release_notes: '',
    release_date: '',
    git_merge_mr: '',
    ticket_ids: [],
  });
  // An epic's tickets, fetched the first time that epic is picked and kept for
  // as long as the modal is open - picking and unpicking must select and
  // deselect the same set.
  const [epicTickets, setEpicTickets] = useState<Map<number, Ticket[]>>(new Map());
  // Where the next page of matches resumes; null once there are no more.
  const [ticketCursor, setTicketCursor] = useState<string | null>(null);
  const [ticketTotal, setTicketTotal] = useState(0);
  const [isLoadingMoreTickets, setIsLoadingMoreTickets] = useState(false);
  const ticketSearchRef = useRef<HTMLInputElement>(null);
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [allEpics, setAllEpics] = useState<EpicListItem[]>([]);
  const [selectedEpicIds, setSelectedEpicIds] = useState<Set<number>>(new Set());
  const [epicSearchQuery, setEpicSearchQuery] = useState('');
  const [filteredEpics, setFilteredEpics] = useState<EpicListItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [isLoadingEpics, setIsLoadingEpics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectionTab, setSelectionTab] = useState<'tickets' | 'epics'>('tickets');

  // Today in the input's YYYY-MM-DD format (local), used to block past release dates.
  const todayStr = (() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      loadEpics();
    }
  }, [isOpen, projectId]);

  // Matching tickets come from the server as you type, rather than the whole
  // project being downloaded so the browser can search it. Debounced, so a word
  // is one request; an empty search is the most recent issues.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const run = async () => {
      setIsLoadingTickets(true);
      try {
        const page = await ticketsAPI.getTicketsPage(projectId, {
          q: searchQuery.trim() || undefined,
          types: RELEASABLE_TYPES,
          limit: PICKER_PAGE_SIZE,
        });
        if (cancelled) return;
        setFilteredTickets(page.items);
        setTicketCursor(page.next_cursor);
        setTicketTotal(page.total);
      } catch (err) {
        console.error('Failed to load tickets:', err);
      } finally {
        if (!cancelled) setIsLoadingTickets(false);
      }
    };

    const timer = window.setTimeout(run, searchQuery ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, projectId, searchQuery]);

  useEffect(() => {
    // Filter epics based on search query
    if (epicSearchQuery.trim()) {
      const query = epicSearchQuery.toLowerCase();
      const filtered = allEpics.filter(
        (epic) =>
          epic.key.toLowerCase().includes(query) ||
          epic.title.toLowerCase().includes(query)
      );
      setFilteredEpics(filtered);
    } else {
      setFilteredEpics(allEpics);
    }
  }, [epicSearchQuery, allEpics]);

  const loadEpics = async () => {
    setIsLoadingEpics(true);
    try {
      const response = await epicsApi.listEpics(projectId, {});
      setAllEpics(response);
      setFilteredEpics(response);
    } catch (err: any) {
      console.error('Failed to load epics:', err);
    } finally {
      setIsLoadingEpics(false);
    }
  };

  const toggleTicketSelection = (ticketId: number) => {
    const newSelection = new Set(selectedTicketIds);
    if (newSelection.has(ticketId)) {
      newSelection.delete(ticketId);
    } else {
      newSelection.add(ticketId);
    }
    setSelectedTicketIds(newSelection);
  };

  /** The next page of the current ticket search, appended to what is shown. */
  const loadMoreTickets = async () => {
    if (!ticketCursor || isLoadingMoreTickets) return;
    setIsLoadingMoreTickets(true);
    try {
      const page = await ticketsAPI.getTicketsPage(projectId, {
        q: searchQuery.trim() || undefined,
        types: RELEASABLE_TYPES,
        limit: PICKER_PAGE_SIZE,
        cursor: ticketCursor,
      });
      setFilteredTickets((prev) => [...prev, ...page.items]);
      setTicketCursor(page.next_cursor);
    } catch (err) {
      console.error('Failed to load more tickets:', err);
    } finally {
      setIsLoadingMoreTickets(false);
    }
  };

  /** An epic's tickets: asked for once, then remembered for this modal. */
  const ticketsOfEpic = async (epicId: number): Promise<Ticket[]> => {
    const known = epicTickets.get(epicId);
    if (known) return known;
    const rows = await ticketsAPI.getTickets(projectId, { epic_id: epicId });
    setEpicTickets((prev) => new Map(prev).set(epicId, rows));
    return rows;
  };

  const toggleEpicSelection = async (epicId: number) => {
    const newSelection = new Set(selectedEpicIds);
    const adding = !newSelection.has(epicId);

    let rows: Ticket[];
    try {
      rows = await ticketsOfEpic(epicId);
    } catch (err) {
      console.error('Failed to load the epic\'s tickets:', err);
      return;
    }

    const newTicketSelection = new Set(selectedTicketIds);
    for (const ticket of rows) {
      if (adding) newTicketSelection.add(ticket.id);
      else newTicketSelection.delete(ticket.id);
    }
    if (adding) newSelection.add(epicId);
    else newSelection.delete(epicId);

    setSelectedTicketIds(newTicketSelection);
    setSelectedEpicIds(newSelection);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Release name is required');
      return;
    }

    if (!formData.version.trim()) {
      setError('Release version is required');
      return;
    }

    if (!VERSION_ALLOWED.test(formData.version.trim())) {
      setError('Version can only contain letters, numbers and dots (.)');
      return;
    }

    // Release date is optional, but when one is set it can't be in the past.
    if (formData.release_date && formData.release_date < todayStr) {
      setError('Release date cannot be in the past');
      return;
    }

    setIsSubmitting(true);

    try {
      await createRelease(projectId, {
        ...formData,
        name: formData.name.trim(),
        version: formData.version.trim(),
        // Never send an empty string: the API parses release_date as a date and an
        // empty value 422s. (Required above, but keep this defensive.)
        release_date: formData.release_date || undefined,
        ticket_ids: Array.from(selectedTicketIds),
      });

      // Reset form
      setFormData({
        name: '',
        version: '',
        description: '',
        release_notes: '',
        release_date: '',
        git_merge_mr: '',
        ticket_ids: [],
      });
      setSelectedTicketIds(new Set());
      setSearchQuery('');

      onReleaseCreated?.();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create release');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        name: '',
        version: '',
        description: '',
        release_notes: '',
        release_date: '',
        git_merge_mr: '',
        ticket_ids: [],
      });
      setSelectedTicketIds(new Set());
      setSelectedEpicIds(new Set());
      setSearchQuery('');
      setEpicSearchQuery('');
      setSelectionTab('tickets');
      setError(null);
      onClose();
    }
  };

  // Required fields for enabling the submit button (past-date is checked on submit).
  const canSubmit =
    !isSubmitting && !!formData.name.trim() && !!formData.version.trim();

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(9, 30, 66, 0.54)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      fontFamily: 'var(--font-sans)',
    }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #DFE1E6',
        borderRadius: 12,
        width: '90%',
        maxWidth: 640,
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0px 8px 24px rgba(9, 30, 66, 0.12)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #DFE1E6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}>
          <h2 style={{
            fontSize: 16,
            fontWeight: 600,
            color: '#172B4D',
            margin: 0,
            letterSpacing: '-0.01em',
          }}>
            Create release
          </h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            style={{
              width: 32,
              height: 32,
              background: 'transparent',
              border: 'none',
              borderRadius: 3,
              color: '#42526E',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = '#F4F5F7';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
            {/* Error Message */}
            {error && (
              <div style={{
                padding: '10px 12px',
                backgroundColor: '#FFEBE6',
                border: '1px solid #FFBDAD',
                borderRadius: 3,
                color: '#BF2600',
                marginBottom: 16,
                fontSize: 13,
              }}>
                {error}
              </div>
            )}

            {/* Name and Version Row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: 12,
              marginBottom: 16,
            }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>
                  Release name <span style={{ color: '#DE350B' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Q4 2024 Release"
                  disabled={isSubmitting}
                  style={inputBaseStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              {/* Version */}
              <div>
                <label style={labelStyle}>
                  Version <span style={{ color: '#DE350B' }}>*</span>
                </label>
                <input
                  type="text"
                  value={formData.version}
                  onChange={(e) =>
                    // Keep only letters, digits and dots as the user types.
                    setFormData({ ...formData, version: e.target.value.replace(/[^A-Za-z0-9.]/g, '') })
                  }
                  placeholder="e.g. 1.0.0"
                  disabled={isSubmitting}
                  style={inputBaseStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this release"
                rows={3}
                disabled={isSubmitting}
                style={{
                  ...inputBaseStyle,
                  resize: 'vertical',
                }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>

            {/* Release Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Release notes
              </label>
              <textarea
                value={formData.release_notes}
                onChange={(e) => setFormData({ ...formData, release_notes: e.target.value })}
                placeholder="Detailed release notes, changelog, and important updates"
                rows={4}
                disabled={isSubmitting}
                style={{
                  ...inputBaseStyle,
                  resize: 'vertical',
                }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>

            {/* Release Date and Git MR Row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 16,
            }}>
              {/* Release Date */}
              <div>
                <label style={labelStyle}>
                  Release date
                </label>
                <input
                  type="date"
                  value={formData.release_date || ''}
                  min={todayStr}
                  onChange={(e) => setFormData({ ...formData, release_date: e.target.value })}
                  disabled={isSubmitting}
                  style={inputBaseStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              {/* Git Merge MR URL */}
              <div>
                <label style={labelStyle}>
                  Git merge/MR URL
                </label>
                <input
                  type="url"
                  value={formData.git_merge_mr || ''}
                  onChange={(e) => setFormData({ ...formData, git_merge_mr: e.target.value })}
                  placeholder="https://gitlab.com/..."
                  disabled={isSubmitting}
                  style={inputBaseStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
            </div>

            {/* Tickets/Epics Section */}
            <div style={{ marginBottom: 4 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: 8,
              }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  In this release <span style={{ color: '#6B778C', textTransform: 'none', letterSpacing: 0, fontSize: 12, fontWeight: 400 }}>
                    ({selectedTicketIds.size} tickets, {selectedEpicIds.size} epics)
                  </span>
                </label>
              </div>

              {(
                <div style={{
                  border: '1px solid #DFE1E6',
                  borderRadius: 3,
                  padding: 12,
                  maxHeight: 320,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: '#FFFFFF',
                }}>
                  {/* Tabs */}
                  <div style={{
                    display: 'flex',
                    gap: 0,
                    marginBottom: 12,
                    borderBottom: '1px solid #DFE1E6',
                  }}>
                    <button
                      type="button"
                      onClick={() => setSelectionTab('tickets')}
                      style={{
                        padding: '8px 12px',
                        fontSize: 13,
                        fontWeight: 500,
                        color: selectionTab === 'tickets' ? '#0052CC' : '#5E6C84',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderBottom: selectionTab === 'tickets' ? '2px solid #0052CC' : '2px solid transparent',
                        cursor: 'pointer',
                        marginBottom: '-1px',
                      }}
                    >
                      Individual tickets
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectionTab('epics')}
                      style={{
                        padding: '8px 12px',
                        fontSize: 13,
                        fontWeight: 500,
                        color: selectionTab === 'epics' ? '#0052CC' : '#5E6C84',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderBottom: selectionTab === 'epics' ? '2px solid #0052CC' : '2px solid transparent',
                        cursor: 'pointer',
                        marginBottom: '-1px',
                      }}
                    >
                      Epics (all tickets)
                    </button>
                  </div>

                  <div style={{ flex: 1, overflow: 'auto' }}>
                    {selectionTab === 'tickets' ? (
                      <>
                        {/* Search Tickets */}
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
                            ref={ticketSearchRef}
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search tickets..."
                            style={{
                              ...inputBaseStyle,
                              paddingLeft: 32,
                              paddingRight: 32,
                            }}
                            onFocus={handleInputFocus}
                            onBlur={handleInputBlur}
                          />
                          {searchQuery && (
                            <button
                              type="button"
                              aria-label="Clear search"
                              onClick={() => {
                                setSearchQuery('');
                                ticketSearchRef.current?.focus();
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
                                color: '#8993A4',
                              }}
                            >
                              &#10005;
                            </button>
                          )}
                        </div>

                        {/* Ticket List */}
                        {/* Keep the current matches visible while the next
                            search is in flight; see AddTicketsToEpicModal. */}
                        {isLoadingTickets && filteredTickets.length === 0 ? (
                          <div style={{
                            textAlign: 'center',
                            padding: 16,
                            color: '#6B778C',
                            fontSize: 13,
                          }}>
                            Loading tickets...
                          </div>
                        ) : filteredTickets.length === 0 ? (
                          <div style={{
                            textAlign: 'center',
                            padding: 16,
                            color: '#6B778C',
                            fontSize: 13,
                          }}>
                            No tickets found
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {filteredTickets.map((ticket) => (
                              <label
                                key={ticket.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '8px',
                                  cursor: 'pointer',
                                  borderRadius: 3,
                                  transition: 'background-color 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = '#F4F5F7';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedTicketIds.has(ticket.id)}
                                  onChange={() => toggleTicketSelection(ticket.id)}
                                  style={{
                                    cursor: 'pointer',
                                    width: 14,
                                    height: 14,
                                    accentColor: '#0052CC',
                                  }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: '#172B4D',
                                  }}>
                                    {ticket.key}
                                  </div>
                                  <div style={{
                                    fontSize: 12,
                                    color: '#6B778C',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {ticket.title}
                                  </div>
                                </div>
                                {ticket.status_name && (
                                  <span style={{
                                    fontSize: 11,
                                    fontWeight: 500,
                                    padding: '2px 6px',
                                    backgroundColor: '#F4F5F7',
                                    borderRadius: 3,
                                    color: '#42526E',
                                  }}>
                                    {ticket.status_name}
                                  </span>
                                )}
                              </label>
                            ))}

                            {ticketCursor && (
                              <button
                                type="button"
                                onClick={loadMoreTickets}
                                disabled={isLoadingMoreTickets}
                                style={{
                                  marginTop: 4,
                                  padding: '6px 8px',
                                  background: 'white',
                                  border: '1px solid #DFE1E6',
                                  borderRadius: 3,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: '#44546F',
                                  cursor: isLoadingMoreTickets ? 'default' : 'pointer',
                                }}
                              >
                                {isLoadingMoreTickets
                                  ? 'Loading...'
                                  : `Load more (${filteredTickets.length} of ${ticketTotal})`}
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Search Epics */}
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
                            value={epicSearchQuery}
                            onChange={(e) => setEpicSearchQuery(e.target.value)}
                            placeholder="Search epics..."
                            style={{
                              ...inputBaseStyle,
                              paddingLeft: 32,
                            }}
                            onFocus={handleInputFocus}
                            onBlur={handleInputBlur}
                          />
                        </div>

                        {/* Epic List */}
                        {isLoadingEpics ? (
                          <div style={{
                            textAlign: 'center',
                            padding: 16,
                            color: '#6B778C',
                            fontSize: 13,
                          }}>
                            Loading epics...
                          </div>
                        ) : filteredEpics.length === 0 ? (
                          <div style={{
                            textAlign: 'center',
                            padding: 16,
                            color: '#6B778C',
                            fontSize: 13,
                          }}>
                            No epics found
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {filteredEpics.map((epic) => {
                              // The epic's own count, which it already carries - the
                              // project's tickets are no longer all loaded to count them.
                              const epicTicketsCount = epic.total_tickets;
                              return (
                                <label
                                  key={epic.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '8px',
                                    cursor: 'pointer',
                                    borderRadius: 3,
                                    transition: 'background-color 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#F4F5F7';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedEpicIds.has(epic.id)}
                                    onChange={() => toggleEpicSelection(epic.id)}
                                    style={{
                                      cursor: 'pointer',
                                      width: 14,
                                      height: 14,
                                      accentColor: '#0052CC',
                                    }}
                                  />
                                  <div
                                    style={{
                                      width: 8,
                                      height: 8,
                                      borderRadius: 2,
                                      backgroundColor: epic.color,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                      fontSize: 13,
                                      fontWeight: 500,
                                      color: '#172B4D',
                                    }}>
                                      {epic.key}
                                    </div>
                                    <div style={{
                                      fontSize: 12,
                                      color: '#6B778C',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {epic.title}
                                    </div>
                                    <div style={{
                                      fontSize: 11,
                                      color: '#8993A4',
                                      marginTop: 2,
                                    }}>
                                      {epicTicketsCount} tickets
                                    </div>
                                  </div>
                                  <span style={{
                                    fontSize: 11,
                                    fontWeight: 500,
                                    padding: '2px 6px',
                                    backgroundColor: '#F4F5F7',
                                    borderRadius: 3,
                                    color: '#42526E',
                                    textTransform: 'capitalize',
                                  }}>
                                    {epic.status.replace('_', ' ')}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{
            padding: '12px 24px',
            borderTop: '1px solid #DFE1E6',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            backgroundColor: '#FFFFFF',
            flexShrink: 0,
          }}>
            <ButtonCore
              variant="secondary"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </ButtonCore>
            <ButtonCore
              type="submit"
              variant="primary"
              disabled={!canSubmit}
              loading={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create release'}
            </ButtonCore>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateReleaseModal;
