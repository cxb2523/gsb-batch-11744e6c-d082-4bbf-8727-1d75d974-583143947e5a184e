import React from 'react';
import { MessageSquare, Clock } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { TicketHistory } from '../../lib/api/tickets';
import TicketComments from '../TicketComments';
import { HistoryPanel } from './HistoryPanel';

type ActivityTab = 'comments' | 'history' | 'worklogs';

interface ActivityTabsProps {
  activeTab: ActivityTab;
  setActiveTab: React.Dispatch<React.SetStateAction<ActivityTab>>;
  projectId: number;
  ticketId: number;
  history: TicketHistory[];
}

/** The ticket's Activity area: tab bar plus the Comments and History panels. */
export function ActivityTabs({ activeTab, setActiveTab, projectId, ticketId, history }: ActivityTabsProps) {
  return (
                <div>
                  <h4
                    style={{
                      margin: '0 0 20px',
                      fontSize: 14,
                      fontWeight: 600,
                      color: tokens.colors.neutral[900],
                    }}
                  >
                    Activity
                  </h4>

                  {/* Tab Navigation */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 4,
                      marginBottom: 24,
                      borderBottom: `2px solid ${tokens.colors.neutral[200]}`,
                    }}
                  >
                    {[
                      { id: 'comments' as const, label: 'Comments', icon: MessageSquare },
                      { id: 'history' as const, label: 'History', icon: Clock },
                      // HIDDEN (open-source launch): { id: 'worklogs' as const, label: 'Work Log', icon: Clock },
                    ].map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          style={{
                            padding: '12px 20px',
                            border: 'none',
                            backgroundColor: 'transparent',
                            color: activeTab === tab.id ? tokens.colors.primary[600] : tokens.colors.neutral[600],
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                            borderBottom: `2px solid ${activeTab === tab.id ? tokens.colors.primary[600] : 'transparent'}`,
                            marginBottom: -2,
                            transition: 'all 0.15s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                          onMouseEnter={(e) => {
                            if (activeTab !== tab.id) {
                              e.currentTarget.style.color = tokens.colors.neutral[800];
                              e.currentTarget.style.backgroundColor = tokens.colors.neutral[50];
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (activeTab !== tab.id) {
                              e.currentTarget.style.color = tokens.colors.neutral[600];
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }
                          }}
                        >
                          <Icon size={16} />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tab Content */}
                  {activeTab === 'comments' && (
                    <TicketComments
                      projectId={projectId}
                      ticketId={ticketId}
                    />
                  )}

                  {activeTab === 'history' && <HistoryPanel history={history} />}

                  {/* HIDDEN (open-source launch): Work Log tab panel
                  {activeTab === 'worklogs' && (
                    <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                      ... worklog list + Log Work button ...
                    </div>
                  )}
                  */}
                </div>
  );
}
