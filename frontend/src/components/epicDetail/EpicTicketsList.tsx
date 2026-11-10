import React from 'react';
import { Search } from 'lucide-react';
import { StatusPill } from '@/design-system/components/StatusPill';
import { Ticket } from './constants';
import { sectionLabelStyle, inputBaseStyle, handleInputFocus, handleInputBlur } from './styles';

interface EpicTicketsListProps {
  tickets: Ticket[];
  filteredTickets: Ticket[];
  ticketSearchQuery: string;
  setTicketSearchQuery: (value: string) => void;
  isLoadingTickets: boolean;
  onTicketClick: (ticketId: number) => void;
  onRemoveTicket: (ticketId: number) => void;
}

export function EpicTicketsList({
  tickets,
  filteredTickets,
  ticketSearchQuery,
  setTicketSearchQuery,
  isLoadingTickets,
  onTicketClick,
  onRemoveTicket,
}: EpicTicketsListProps) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={sectionLabelStyle}>Tickets in this epic</div>

      {/* Search */}
      {tickets.length > 0 && (
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
            placeholder="Search tickets by key or title..."
            value={ticketSearchQuery}
            onChange={(e) => setTicketSearchQuery(e.target.value)}
            disabled={isLoadingTickets}
            style={{
              ...inputBaseStyle,
              paddingLeft: 32,
            }}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
          />
        </div>
      )}

      {isLoadingTickets ? (
        <div style={{
          textAlign: 'center',
          padding: 24,
          color: '#6B778C',
          fontSize: 13,
        }}>
          Loading tickets...
        </div>
      ) : tickets.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 24,
          backgroundColor: '#FAFBFC',
          border: '1px solid #DFE1E6',
          borderRadius: 3,
          color: '#6B778C',
          fontSize: 13,
        }}>
          No tickets in this epic yet
        </div>
      ) : filteredTickets.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 24,
          backgroundColor: '#FAFBFC',
          border: '1px solid #DFE1E6',
          borderRadius: 3,
          color: '#6B778C',
          fontSize: 13,
        }}>
          No tickets found matching "{ticketSearchQuery}"
        </div>
      ) : (
        <div>
          <div style={{
            fontSize: 12,
            color: '#6B778C',
            marginBottom: 8,
          }}>
            Showing {filteredTickets.length} of {tickets.length} tickets
          </div>
          <div style={{
            border: '1px solid #DFE1E6',
            borderRadius: 3,
            maxHeight: 300,
            overflow: 'auto',
            backgroundColor: '#FFFFFF',
          }}>
            {filteredTickets.map((ticket, index) => (
              <div
                key={ticket.id}
                style={{
                  padding: 12,
                  borderBottom: index < filteredTickets.length - 1 ? '1px solid #DFE1E6' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'background-color 0.15s ease',
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F4F5F7'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#FFFFFF'}
              >
                <div
                  style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}
                  onClick={() => onTicketClick(ticket.id)}
                >
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#172B4D',
                    marginBottom: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    <span style={{ color: '#6B778C', marginRight: 6 }}>{ticket.key}</span>
                    {ticket.title}
                  </div>
                  <StatusPill
                    name={ticket.status_name}
                    color={ticket.status_color}
                    category={ticket.status_category}
                  />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveTicket(ticket.id);
                  }}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: 'transparent',
                    color: '#42526E',
                    border: '1px solid #DFE1E6',
                    borderRadius: 3,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFEBE6';
                    e.currentTarget.style.color = '#BF2600';
                    e.currentTarget.style.borderColor = '#FFBDAD';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#42526E';
                    e.currentTarget.style.borderColor = '#DFE1E6';
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
