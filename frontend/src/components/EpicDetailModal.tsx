'use client';

import React from 'react';
import { EpicIcon } from './icons/EpicIcon';
import { AddTicketsToEpicModal } from './AddTicketsToEpicModal';
import TicketDetailModal from './TicketDetailModal';
import { X } from 'lucide-react';
import { useEpicDetail } from './epicDetail/useEpicDetail';
import { EpicOverview } from './epicDetail/EpicOverview';
import { EpicTicketsList } from './epicDetail/EpicTicketsList';

interface EpicDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  epicId: number;
  onEpicUpdated?: () => void;
}

export const EpicDetailModal: React.FC<EpicDetailModalProps> = ({
  isOpen,
  onClose,
  projectId,
  epicId,
  onEpicUpdated,
}) => {
  const {
    epic,
    tickets,
    filteredTickets,
    ticketSearchQuery,
    setTicketSearchQuery,
    isLoading,
    isLoadingTickets,
    isUpdatingStatus,
    error,
    isAddTicketsModalOpen,
    setIsAddTicketsModalOpen,
    showTickets,
    selectedTicketId,
    isTicketDetailModalOpen,
    members,
    isUpdatingOwner,
    statusVisual,
    progressColor,
    handleViewTickets,
    handleTicketClick,
    handleCloseTicketDetail,
    handleTicketUpdated,
    handleOwnerChange,
    handleStatusChange,
    handleAddTickets,
    handleRemoveTicketFromEpic,
    handleTicketsAdded,
  } = useEpicDetail({ isOpen, onClose, projectId, epicId, onEpicUpdated });

  if (!isOpen) return null;

  // Add animations if not already added
  if (typeof document !== 'undefined') {
    const styleId = 'epic-modal-animations';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  return (
    <div
      onClick={(e) => {
        // Close only when the backdrop itself is clicked, not content inside it.
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
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
    >
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #DFE1E6',
        borderRadius: 12,
        width: '90%',
        maxWidth: 960,
        maxHeight: '92vh',
        overflow: 'hidden',
        boxShadow: '0px 8px 24px rgba(9, 30, 66, 0.12)',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #DFE1E6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{
              width: 24,
              height: 24,
              borderRadius: 3,
              backgroundColor: epic?.color ? `${epic.color}1A` : '#DEEBFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <EpicIcon size={16} color={epic?.color || '#0052CC'} />
            </div>
            <span style={{
              fontSize: 12,
              color: '#6B778C',
              fontWeight: 500,
              flexShrink: 0,
            }}>
              {epic?.key || 'EPIC'}
            </span>
            <span style={{ color: '#DFE1E6', flexShrink: 0 }}>·</span>
            <h2 style={{
              fontSize: 16,
              fontWeight: 600,
              color: '#172B4D',
              margin: 0,
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}>
              {epic?.title || 'Loading...'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              background: 'transparent',
              border: 'none',
              borderRadius: 3,
              color: '#42526E',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F4F5F7';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          padding: 24,
          overflowY: 'auto',
          flex: 1,
          backgroundColor: '#FFFFFF',
        }}>
          {isLoading ? (
            <div style={{
              textAlign: 'center',
              padding: 60,
              color: '#6B778C',
            }}>
              <div style={{
                width: 32,
                height: 32,
                margin: '0 auto',
                border: '3px solid #DFE1E6',
                borderTopColor: '#0052CC',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <p style={{
                marginTop: 12,
                fontSize: 13,
                fontWeight: 500,
              }}>
                Loading epic details...
              </p>
            </div>
          ) : error ? (
            <div style={{
              padding: '10px 12px',
              backgroundColor: '#FFEBE6',
              border: '1px solid #FFBDAD',
              borderRadius: 3,
              color: '#BF2600',
              fontSize: 13,
            }}>
              {error}
            </div>
          ) : epic ? (
            <>
              <EpicOverview
                epic={epic}
                statusVisual={statusVisual!}
                progressColor={progressColor}
                isUpdatingStatus={isUpdatingStatus}
                onStatusChange={handleStatusChange}
                isUpdatingOwner={isUpdatingOwner}
                members={members}
                onOwnerChange={handleOwnerChange}
                onAddTickets={handleAddTickets}
                onViewTickets={handleViewTickets}
                showTickets={showTickets}
              />

              {showTickets && (
                <EpicTicketsList
                  tickets={tickets}
                  filteredTickets={filteredTickets}
                  ticketSearchQuery={ticketSearchQuery}
                  setTicketSearchQuery={setTicketSearchQuery}
                  isLoadingTickets={isLoadingTickets}
                  onTicketClick={handleTicketClick}
                  onRemoveTicket={handleRemoveTicketFromEpic}
                />
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Add Tickets Modal */}
      {epic && (
        <AddTicketsToEpicModal
          isOpen={isAddTicketsModalOpen}
          onClose={() => setIsAddTicketsModalOpen(false)}
          projectId={projectId}
          epicId={epicId}
          epicTitle={epic.title}
          onTicketsAdded={handleTicketsAdded}
        />
      )}

      {/* Ticket Detail Modal */}
      {selectedTicketId && (
        <TicketDetailModal
          isOpen={isTicketDetailModalOpen}
          onClose={handleCloseTicketDetail}
          projectId={projectId}
          ticketId={selectedTicketId}
          onTicketUpdated={handleTicketUpdated}
        />
      )}
    </div>
  );
};

export default EpicDetailModal;
