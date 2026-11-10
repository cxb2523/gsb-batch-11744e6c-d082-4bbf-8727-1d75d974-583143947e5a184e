'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ticketsAPI } from '@/lib/api/tickets';
import { tokens } from '@/design-system/tokens';

interface Ticket {
  id: number;
  key: string;
  title: string;
  status_name?: string;
  epic_id?: number;
}

interface AddTicketsToEpicModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  epicId: number;
  epicTitle: string;
  onTicketsAdded?: () => void;
}

/**
 * How many matches a search returns. A picker is for finding one or a few
 * things, so the answer to "show me everything" is "search for it" - which is
 * why this list is no longer the whole project.
 */
const PICKER_PAGE_SIZE = 20;

/**
 * Types that can be put in an epic. Epics cannot: an epic contains issues, and
 * without this the epic being edited offers itself as its own content.
 */
const ADDABLE_TYPES = ['story', 'task', 'bug', 'campaign', 'design', 'engineering'];

export const AddTicketsToEpicModal: React.FC<AddTicketsToEpicModalProps> = ({
  isOpen,
  onClose,
  projectId,
  epicId,
  epicTitle,
  onTicketsAdded,
}) => {
  // What the search returned. There is no full copy of the project here: the
  // list is whatever the last query matched.
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Where the next page of matches resumes; null once there are no more.
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [totalMatches, setTotalMatches] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedTicketIds(new Set());
    }
  }, [isOpen, projectId]);

  // Ask the server for what matches, rather than downloading the project and
  // searching it here. Debounced, so typing a word is one request and not one
  // per keystroke; the opening fetch (empty search) is the most recent issues.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const page = await ticketsAPI.getTicketsPage(projectId, {
          q: searchQuery.trim() || undefined,
          types: ADDABLE_TYPES,
          limit: PICKER_PAGE_SIZE,
        });
        if (cancelled) return;
        // Tickets already in this epic are not candidates for adding to it.
        setFilteredTickets(page.items.filter((t) => t.epic_id !== epicId));
        setNextCursor(page.next_cursor);
        setTotalMatches(page.total);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load tickets');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    const timer = window.setTimeout(run, searchQuery ? 300 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, projectId, epicId, searchQuery]);

  const toggleTicketSelection = (ticketId: number) => {
    const newSelection = new Set(selectedTicketIds);
    if (newSelection.has(ticketId)) {
      newSelection.delete(ticketId);
    } else {
      newSelection.add(ticketId);
    }
    setSelectedTicketIds(newSelection);
  };

  /** The next page of the same search, appended to what is already shown. */
  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await ticketsAPI.getTicketsPage(projectId, {
        q: searchQuery.trim() || undefined,
        types: ADDABLE_TYPES,
        limit: PICKER_PAGE_SIZE,
        cursor: nextCursor,
      });
      setFilteredTickets((prev) => [
        ...prev,
        ...page.items.filter((t) => t.epic_id !== epicId),
      ]);
      setNextCursor(page.next_cursor);
    } catch (err: any) {
      setError(err.message || 'Failed to load more tickets');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Selects what is on screen. It used to mean every ticket in the project,
  // because every ticket was loaded; now the list is a page of matches, so the
  // button says which it is rather than quietly meaning something narrower.
  const selectAll = () => {
    setSelectedTicketIds(new Set(filteredTickets.map((t) => t.id)));
  };

  const deselectAll = () => {
    setSelectedTicketIds(new Set());
  };

  const handleSave = async () => {
    if (selectedTicketIds.size === 0) {
      setError('Please select at least one ticket');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      // Update each selected ticket to add epic_id
      const updatePromises = Array.from(selectedTicketIds).map(async (ticketId) => {
        const result = await ticketsAPI.updateTicket(projectId, ticketId, { epic_id: epicId });
        return result;
      });

      const results = await Promise.all(updatePromises);

      onTicketsAdded?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to add tickets to epic:', err);
      setError(err.message || 'Failed to add tickets to epic');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      // Clicking the backdrop closes, as Escape does. Only the backdrop itself:
      // a click that started inside the dialog and happens to bubble out here
      // must not dismiss it.
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: tokens.borderRadius.lg,
          width: '90%',
          maxWidth: '600px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: tokens.shadows.xl,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: tokens.spacing[6],
            borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: tokens.typography.sizes.xl,
                  fontWeight: tokens.typography.weights.semibold,
                  color: tokens.colors.neutral[900],
                  margin: 0,
                  marginBottom: tokens.spacing[1],
                }}
              >
                Add Tickets to Epic
              </h2>
              <p
                style={{
                  fontSize: tokens.typography.sizes.sm,
                  color: tokens.colors.neutral[600],
                  margin: 0,
                }}
              >
                {epicTitle}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isSaving}
              style={{
                background: 'none',
                border: 'none',
                fontSize: tokens.typography.sizes['2xl'],
                color: tokens.colors.neutral[500],
                cursor: isSaving ? 'not-allowed' : 'pointer',
                padding: tokens.spacing[1],
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div
          style={{
            padding: tokens.spacing[4],
            borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search tickets by key or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            // Not disabled while loading. Every keystroke starts a search, and a
            // disabled input loses focus, so typing would eject the cursor after
            // each one. Only a save, which is about to close the modal, locks it.
            disabled={isSaving}
            style={{
              width: '100%',
              padding: tokens.spacing[3],
              fontSize: tokens.typography.sizes.base,
              border: `1px solid ${tokens.colors.neutral[300]}`,
              borderRadius: tokens.borderRadius.md,
              outline: 'none',
              paddingRight: tokens.spacing[10],
            }}
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearchQuery('');
                // Back into the box: clearing is usually the start of the next
                // search, not the end of searching.
                searchInputRef.current?.focus();
              }}
              style={{
                position: 'absolute',
                right: tokens.spacing[6],
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                padding: 4,
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
                color: tokens.colors.neutral[500],
              }}
            >
              &#10005;
            </button>
          )}
        </div>

        {/* Selection Controls */}
        <div
          style={{
            padding: `${tokens.spacing[3]} ${tokens.spacing[4]}`,
            backgroundColor: tokens.colors.neutral[50],
            borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: tokens.typography.sizes.sm,
              color: tokens.colors.neutral[600],
            }}
          >
            {selectedTicketIds.size} selected
            {totalMatches > filteredTickets.length
              ? ` · showing ${filteredTickets.length} of ${totalMatches}`
              : ` · ${filteredTickets.length} shown`}
          </div>
          <div style={{ display: 'flex', gap: tokens.spacing[2] }}>
            <button
              onClick={selectAll}
              disabled={isSaving || filteredTickets.length === 0}
              style={{
                padding: `${tokens.spacing[1]} ${tokens.spacing[3]}`,
                fontSize: tokens.typography.sizes.sm,
                color: tokens.colors.primary[600],
                backgroundColor: 'transparent',
                border: 'none',
                cursor:
                  isSaving || filteredTickets.length === 0 ? 'not-allowed' : 'pointer',
                textDecoration: 'underline',
              }}
            >
              {filteredTickets.length > 0 ? `Select these ${filteredTickets.length}` : 'Select all'}
            </button>
            <button
              onClick={deselectAll}
              disabled={isSaving || selectedTicketIds.size === 0}
              style={{
                padding: `${tokens.spacing[1]} ${tokens.spacing[3]}`,
                fontSize: tokens.typography.sizes.sm,
                color: tokens.colors.neutral[600],
                backgroundColor: 'transparent',
                border: 'none',
                cursor:
                  isSaving || selectedTicketIds.size === 0 ? 'not-allowed' : 'pointer',
                textDecoration: 'underline',
              }}
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Ticket List */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: tokens.spacing[4],
          }}
        >
          {error && (
            <div
              style={{
                padding: tokens.spacing[3],
                backgroundColor: tokens.colors.error[500] + '15',
                border: `1px solid ${tokens.colors.error[500]}`,
                borderRadius: tokens.borderRadius.md,
                color: tokens.colors.error[500],
                marginBottom: tokens.spacing[4],
                fontSize: tokens.typography.sizes.sm,
              }}
            >
              {error}
            </div>
          )}

          {/* Only blank the list when there is nothing to show yet. Replacing the
              results on every keystroke made the panel flash between a list and a
              spinner as you typed; keeping the previous matches until the new ones
              arrive reads as the list narrowing, which is what is happening. */}
          {isLoading && filteredTickets.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: tokens.spacing[12],
                color: tokens.colors.neutral[500],
              }}
            >
              Loading tickets...
            </div>
          ) : filteredTickets.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: tokens.spacing[12],
                color: tokens.colors.neutral[500],
              }}
            >
              {searchQuery
                ? 'No tickets found matching your search'
                : 'No tickets available to add'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing[2] }}>
              {filteredTickets.map((ticket) => (
                <label
                  key={ticket.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: tokens.spacing[3],
                    backgroundColor: selectedTicketIds.has(ticket.id)
                      ? tokens.colors.primary[50]
                      : 'white',
                    border: `1px solid ${
                      selectedTicketIds.has(ticket.id)
                        ? tokens.colors.primary[300]
                        : tokens.colors.neutral[200]
                    }`,
                    borderRadius: tokens.borderRadius.md,
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={(e) => {
                    if (!isSaving && !selectedTicketIds.has(ticket.id)) {
                      e.currentTarget.style.backgroundColor = tokens.colors.neutral[50];
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!selectedTicketIds.has(ticket.id)) {
                      e.currentTarget.style.backgroundColor = 'white';
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedTicketIds.has(ticket.id)}
                    onChange={() => toggleTicketSelection(ticket.id)}
                    disabled={isSaving}
                    style={{
                      width: '18px',
                      height: '18px',
                      marginRight: tokens.spacing[3],
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: tokens.typography.sizes.base,
                        fontWeight: tokens.typography.weights.medium,
                        color: tokens.colors.neutral[900],
                        marginBottom: tokens.spacing[1],
                      }}
                    >
                      {ticket.key}: {ticket.title}
                    </div>
                    {ticket.status_name && (
                      <div
                        style={{
                          fontSize: tokens.typography.sizes.sm,
                          color: tokens.colors.neutral[600],
                        }}
                      >
                        Status: {ticket.status_name}
                      </div>
                    )}
                  </div>
                </label>
              ))}

              {nextCursor && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore || isSaving}
                  style={{
                    marginTop: tokens.spacing[2],
                    padding: tokens.spacing[3],
                    backgroundColor: 'white',
                    border: `1px solid ${tokens.colors.neutral[300]}`,
                    borderRadius: tokens.borderRadius.md,
                    fontSize: tokens.typography.sizes.sm,
                    fontWeight: tokens.typography.weights.medium,
                    color: tokens.colors.neutral[700],
                    cursor: isLoadingMore ? 'default' : 'pointer',
                  }}
                >
                  {isLoadingMore
                    ? 'Loading...'
                    : `Load more (${filteredTickets.length} of ${totalMatches})`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: tokens.spacing[6],
            borderTop: `1px solid ${tokens.colors.neutral[200]}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: tokens.spacing[3],
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
              fontSize: tokens.typography.sizes.base,
              fontWeight: tokens.typography.weights.medium,
              color: tokens.colors.neutral[700],
              backgroundColor: 'white',
              border: `1px solid ${tokens.colors.neutral[300]}`,
              borderRadius: tokens.borderRadius.md,
              cursor: isSaving ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || selectedTicketIds.size === 0}
            style={{
              padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
              fontSize: tokens.typography.sizes.base,
              fontWeight: tokens.typography.weights.medium,
              color: 'white',
              backgroundColor:
                isSaving || selectedTicketIds.size === 0
                  ? tokens.colors.neutral[400]
                  : tokens.colors.primary[600],
              border: 'none',
              borderRadius: tokens.borderRadius.md,
              cursor: isSaving || selectedTicketIds.size === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {isSaving
              ? 'Adding...'
              : `Add ${selectedTicketIds.size} Ticket${selectedTicketIds.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddTicketsToEpicModal;
