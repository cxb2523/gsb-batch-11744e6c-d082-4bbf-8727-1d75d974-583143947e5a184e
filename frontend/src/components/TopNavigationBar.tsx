'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, Bell, HelpCircle, ChevronDown, X, Trash2 } from 'lucide-react';
import { notificationsAPI, Notification } from '../lib/api/settings';
import { ButtonCore, useToast } from './ui';
import { GridLogo } from './GridLogo';
import { useProjectContext, swapProjectInPath, ContextProject as Project } from '../hooks/useProjectContext';
import { useHasGoogleWorkspace } from '../hooks/useCapabilities';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface TopNavigationBarProps {
  user?: User;
  onCreateClick?: () => void;
}

export function TopNavigationBar({ user, onCreateClick }: TopNavigationBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  // Resolved once for the whole tree by ProjectProvider — no per-navigation refetch.
  const { projects, selectedProject } = useProjectContext();
  const hasGoogleWorkspace = useHasGoogleWorkspace();
  const [isProjectSwitcherOpen, setIsProjectSwitcherOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hoveredNotifId, setHoveredNotifId] = useState<number | null>(null);

  const projectSwitcherRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  // Deferred-delete bookkeeping: ids removed from the UI but not yet deleted on
  // the server, so the 30s poll below can't resurrect them mid-undo.
  const pendingDelete = useRef<Set<number>>(new Set());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const clearAllTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load notifications
  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const data = await notificationsAPI.getNotifications();
        // Hide anything the user just deleted while its undo window is still open.
        const visible = data.filter((n: Notification) => !pendingDelete.current.has(n.id));
        const count = visible.filter((n: Notification) => !n.read).length;
        setUnreadCount(count);
        if (isNotificationsOpen) {
          setNotifications(visible);
        }
      } catch {
        setUnreadCount(0);
      }
    };

    loadNotifications();
    const intervalId = setInterval(loadNotifications, 30000);
    return () => clearInterval(intervalId);
  }, [isNotificationsOpen]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (projectSwitcherRef.current && !projectSwitcherRef.current.contains(event.target as Node)) {
        setIsProjectSwitcherOpen(false);
        setProjectSearch('');
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Flush any pending delete timers if the nav unmounts.
  useEffect(() => {
    const timers = deleteTimers.current;
    return () => {
      timers.forEach(t => clearTimeout(t));
      if (clearAllTimer.current) clearTimeout(clearAllTimer.current);
    };
  }, []);

  const handleProjectSelect = (project: Project) => {
    setIsProjectSwitcherOpen(false);
    setProjectSearch('');
    // Stay on the view the user is already looking at: /projects/9/board becomes
    // /projects/3/board. Routes that aren't about a single project fall back to the
    // board. ProjectProvider picks the new project up from the URL.
    router.push(swapProjectInPath(pathname, project.id));
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      try {
        await notificationsAPI.markAsRead(notification.id);
        setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (error) {
        console.error('Failed to mark as read:', error);
      }
    }

    if (notification.project_id && notification.ticket_id) {
      // The ticket lives in the backlog view, so this one keeps its explicit route.
      // ProjectProvider picks the project up from the URL.
      router.push(`/projects/${notification.project_id}/backlog?ticketId=${notification.ticket_id}`);
      setIsNotificationsOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    // Optimistic: clear the unread state immediately, keeping the items in the list.
    const previous = notifications;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await notificationsAPI.markAllAsRead();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      // Roll back so the badge doesn't lie about what the server actually has.
      setNotifications(previous);
      setUnreadCount(previous.filter(n => !n.read).length);
    }
  };

  // Re-insert a notification into the list, keeping newest-first order.
  const restoreNotification = (notif: Notification) => {
    setNotifications(prev =>
      [notif, ...prev].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    );
    if (!notif.read) setUnreadCount(prev => prev + 1);
  };

  const handleDeleteNotification = (notif: Notification, event: React.MouseEvent) => {
    event.stopPropagation(); // deleting a row must never also open the ticket
    // Remove it now; only hit the server once the undo grace period lapses.
    pendingDelete.current.add(notif.id);
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    if (!notif.read) setUnreadCount(prev => Math.max(0, prev - 1));

    const timer = setTimeout(async () => {
      deleteTimers.current.delete(notif.id);
      try {
        await notificationsAPI.deleteNotification(notif.id);
      } catch (error) {
        console.error('Failed to delete notification:', error);
        restoreNotification(notif);
        toast.error('Could not delete notification.');
      } finally {
        pendingDelete.current.delete(notif.id);
      }
    }, 8000); // must outlast the toast's ~7s undo window so undo always wins the race
    deleteTimers.current.set(notif.id, timer);

    toast.success('Notification deleted', {
      label: 'Undo',
      run: () => {
        const t = deleteTimers.current.get(notif.id);
        if (t) clearTimeout(t);
        deleteTimers.current.delete(notif.id);
        pendingDelete.current.delete(notif.id);
        restoreNotification(notif);
      },
    });
  };

  const handleClearAll = () => {
    if (notifications.length === 0) return;
    const snapshot = notifications;
    const prevUnread = unreadCount;
    snapshot.forEach(n => pendingDelete.current.add(n.id));
    setNotifications([]);
    setUnreadCount(0);

    let undone = false;
    const timer = setTimeout(async () => {
      clearAllTimer.current = null;
      if (undone) return;
      try {
        await notificationsAPI.clearAll();
      } catch (error) {
        console.error('Failed to clear notifications:', error);
        setNotifications(snapshot);
        setUnreadCount(prevUnread);
        toast.error('Could not clear notifications.');
      } finally {
        snapshot.forEach(n => pendingDelete.current.delete(n.id));
      }
    }, 8000);
    clearAllTimer.current = timer;

    toast.success(`Cleared ${snapshot.length} notification${snapshot.length === 1 ? '' : 's'}`, {
      label: 'Undo',
      run: () => {
        undone = true;
        if (clearAllTimer.current) clearTimeout(clearAllTimer.current);
        clearAllTimer.current = null;
        snapshot.forEach(n => pendingDelete.current.delete(n.id));
        setNotifications(snapshot);
        setUnreadCount(prevUnread);
      },
    });
  };

  const handleLogout = async () => {
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      // Clear any per-user state cached in the browser so it doesn't leak into the
      // next session on this machine (e.g. selected project, board filters).
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        /* private mode or blocked storage: nothing to clear */
      }
      window.location.href = '/login';
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getProjectAvatar = (project: Project) => {
    return project.key.slice(0, 2).toUpperCase();
  };

  const navItems = [
    { id: 'work', label: 'Your Work', href: '/dashboard', icon: null },
    { id: 'standup', label: 'Standup', href: '/standup', icon: null },
    { id: 'projects', label: 'Projects', href: '/projects', icon: null },
    { id: 'timeline', label: 'Project Timeline', href: '/projects/timeline', icon: null },
  ];

  const matchesNav = (item: { id: string; href: string }) => {
    const { href } = item;
    if (href === '#') return false;
    if (href === '/dashboard') return pathname === href || pathname === '/';
    // "Projects" owns /projects and per-project pages (/projects/123/...), but NOT
    // sibling static routes like /projects/timeline, which have their own nav item.
    if (href === '/projects') {
      return pathname === '/projects' || /^\/projects\/\d+/.test(pathname);
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  // With the rules above no two items can match the same path, so the single matching
  // item lights up. The longest-href tiebreaker is kept as a guard against future
  // overlaps — it never highlights two tabs at once.
  const activeNavId = navItems
    .filter((item) => matchesNav(item))
    .sort((a, b) => b.href.length - a.href.length)[0]?.id ?? null;

  const isActiveNav = (item: { id: string }) => item.id === activeNavId;

  return (
    <nav
      style={{
        height: '56px',
        background: '#FFFFFF',
        borderBottom: '1px solid #DFE1E6',
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '16px',
        position: 'relative',
        zIndex: 1000,
      }}
    >
      {/* Logo */}
      <Link
        href="/dashboard"
        style={{
          width: '56px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          borderRadius: '3px',
          transition: 'background-color 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#F4F5F7'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <GridLogo variant="icon" theme="light" size={32} />
      </Link>

      {/* Project Switcher */}
      <div ref={projectSwitcherRef} style={{ position: 'relative' }}>
        <button
          onClick={() => {
            setIsProjectSwitcherOpen(!isProjectSwitcherOpen);
            setProjectSearch('');
          }}
          style={{
            height: '32px',
            padding: '0 8px',
            background: 'transparent',
            border: '1px solid #DFE1E6',
            borderRadius: '3px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            color: '#172B4D',
            fontWeight: 500,
            transition: 'all 0.15s',
            maxWidth: '200px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#F4F5F7';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          {selectedProject && (
            <>
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '3px',
                  background: '#0052CC',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                }}
              >
                {getProjectAvatar(selectedProject)}
              </div>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedProject.name}
              </span>
            </>
          )}
          {!selectedProject && <span>Select project</span>}
          <ChevronDown size={16} style={{ flexShrink: 0 }} />
        </button>

        {/* Project Switcher Dropdown */}
        {isProjectSwitcherOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              width: '300px',
              maxHeight: '400px',
              background: '#FFFFFF',
              border: '1px solid #DFE1E6',
              borderRadius: '3px',
              boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
              overflow: 'auto',
              zIndex: 1001,
            }}
          >
            {/* Search projects */}
            <div style={{ padding: '8px', borderBottom: '1px solid #EBECF0' }}>
              <input
                type="text"
                autoFocus
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Search projects..."
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #DFE1E6',
                  borderRadius: '3px',
                  fontSize: '14px',
                  fontFamily: 'var(--font-sans)',
                  outline: 'none',
                }}
              />
            </div>

            {/* Projects list */}
            <div style={{ padding: '4px 0' }}>
              {(() => {
                const query = projectSearch.trim().toLowerCase();
                const filteredProjects = query
                  ? projects.filter(
                      (p) =>
                        p.name.toLowerCase().includes(query) ||
                        p.key.toLowerCase().includes(query)
                    )
                  : projects;
                return filteredProjects.length === 0 ? (
                <div
                  style={{
                    padding: '16px',
                    textAlign: 'center',
                    fontSize: '14px',
                    color: '#5E6C84',
                  }}
                >
                  {projects.length === 0 ? 'No projects available' : 'No projects match your search'}
                </div>
              ) : (
                filteredProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleProjectSelect(project)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: selectedProject?.id === project.id ? '#DEEBFF' : 'transparent',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                      fontSize: '14px',
                      color: '#172B4D',
                      textAlign: 'left',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedProject?.id !== project.id) {
                        e.currentTarget.style.background = '#F4F5F7';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedProject?.id !== project.id) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '3px',
                        background: '#0052CC',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#FFFFFF',
                        flexShrink: 0,
                      }}
                    >
                      {getProjectAvatar(project)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, marginBottom: '2px' }}>{project.name}</div>
                      <div style={{ fontSize: '12px', color: '#5E6C84' }}>{project.key}</div>
                    </div>
                  </button>
                ))
              );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '8px' }}>
        {navItems.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActiveNav(item) ? 'page' : undefined}
            style={{
              height: '32px',
              padding: '0 10px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: isActiveNav(item) ? 600 : 500,
              color: isActiveNav(item) ? '#0C66E4' : '#44546F',
              background: isActiveNav(item) ? '#E9F2FF' : 'transparent',
              transition: 'background-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isActiveNav(item)) {
                e.currentTarget.style.background = '#F1F2F4';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActiveNav(item)) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* Create Button */}
      <ButtonCore
        variant="primary"
        onClick={onCreateClick}
        leftIcon={<Plus size={16} />}
        // Layout only: the nav lays its items out with this pushed to the right.
        style={{ marginLeft: 'auto' }}
      >
        Create
      </ButtonCore>

      {/* Global search hidden for v1: the input was never wired to the existing
          search API, and making it truly cross-project needs a new endpoint + a
          results dropdown + validation. Tracked in POST_V1_FOLLOWUPS.md ("Global
          cross-project search"); restore and wire it up there. */}

      {/* Notifications */}
      <div ref={notificationsRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
          style={{
            width: '32px',
            height: '32px',
            background: 'transparent',
            border: 'none',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            position: 'relative',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#F4F5F7'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <Bell size={20} color="#42526E" />
          {unreadCount > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '0px',
                right: '0px',
                minWidth: '18px',
                height: '18px',
                padding: '0 4px',
                background: '#DE350B',
                borderRadius: '999px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 600,
                color: '#FFFFFF',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}
        </button>

        {/* Notifications Dropdown (simplified for now) */}
        {isNotificationsOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              width: '380px',
              maxHeight: '480px',
              background: '#FFFFFF',
              border: '1px solid #C1C7D0',
              borderRadius: '4px',
              // A real elevation + hairline so the panel lifts off the page instead
              // of blending into whatever sits behind it.
              boxShadow: '0 8px 16px -4px rgba(9,30,66,0.25), 0 0 1px rgba(9,30,66,0.31)',
              overflow: 'hidden',
              zIndex: 1001,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px 16px',
                borderBottom: '1px solid #EBECF0',
                fontSize: '14px',
                fontWeight: 600,
                color: '#172B4D',
              }}
            >
              <span>Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#0052CC',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                >
                  Mark all as read
                </button>
              )}
            </div>
            <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    fontSize: '14px',
                    color: '#5E6C84',
                  }}
                >
                  No notifications
                </div>
              ) : (
                notifications.map((notif, index) => (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    style={{
                      position: 'relative',
                      // Reserve room for the delete button so revealing it never reflows the text.
                      padding: '12px 40px 12px 16px',
                      borderBottom: index === notifications.length - 1 ? 'none' : '1px solid #EBECF0',
                      background: notif.read ? '#F4F5F7' : '#FFFFFF',
                      cursor: notif.project_id && notif.ticket_id ? 'pointer' : 'default',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      setHoveredNotifId(notif.id);
                      if (notif.project_id && notif.ticket_id) {
                        e.currentTarget.style.background = '#DEEBFF';
                      }
                    }}
                    onMouseLeave={(e) => {
                      setHoveredNotifId((id) => (id === notif.id ? null : id));
                      e.currentTarget.style.background = notif.read ? '#F4F5F7' : '#FFFFFF';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: '4px' }}>
                      {!notif.read && (
                        <span
                          style={{
                            flexShrink: 0,
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            backgroundColor: '#E53935',
                            marginTop: 5,
                          }}
                        />
                      )}
                      <span style={{ fontSize: '14px', fontWeight: notif.read ? 400 : 600, color: '#172B4D' }}>
                        {notif.message}
                      </span>
                    </div>
                    {notif.ticket_key && (
                      <div style={{ fontSize: '12px', color: '#5E6C84', marginBottom: '4px' }}>
                        {notif.ticket_key}
                      </div>
                    )}
                    <div style={{ fontSize: '11px', color: '#5E6C84' }}>
                      {new Date(notif.created_at).toLocaleString()}
                    </div>

                    {hoveredNotifId === notif.id && (
                      <button
                        onClick={(e) => handleDeleteNotification(notif, e)}
                        aria-label="Delete notification"
                        title="Delete notification"
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '24px',
                          height: '24px',
                          padding: 0,
                          border: 'none',
                          borderRadius: '3px',
                          background: 'rgba(9,30,66,0.06)',
                          color: '#5E6C84',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s, color 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#FFEBE6';
                          e.currentTarget.style.color = '#DE350B';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(9,30,66,0.06)';
                          e.currentTarget.style.color = '#5E6C84';
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {notifications.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  padding: '8px 12px',
                  borderTop: '1px solid #DFE1E6',
                  background: '#FAFBFC',
                }}
              >
                <button
                  onClick={handleClearAll}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 8px',
                    border: 'none',
                    borderRadius: '3px',
                    background: 'transparent',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#DE350B',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#FFEBE6')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Trash2 size={14} />
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Profile */}
      <div ref={profileRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setIsProfileOpen(!isProfileOpen)}
          style={{
            width: '32px',
            height: '32px',
            background: '#0052CC',
            border: 'none',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
            color: '#FFFFFF',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          {user ? getInitials(user.name) : 'U'}
        </button>

        {/* Profile Dropdown */}
        {isProfileOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              width: '280px',
              background: '#FFFFFF',
              border: '1px solid #DFE1E6',
              borderRadius: '3px',
              boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
              overflow: 'hidden',
              zIndex: 1001,
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #EBECF0' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#172B4D' }}>
                {user?.name || 'User'}
              </div>
              <div style={{ fontSize: '12px', color: '#5E6C84', marginTop: '2px' }}>
                {user?.email || 'user@example.com'}
              </div>
              {user?.role === 'admin' && (
                <div
                  style={{
                    display: 'inline-block',
                    marginTop: '8px',
                    padding: '2px 8px',
                    background: '#DEEBFF',
                    border: '1px solid #0052CC',
                    borderRadius: '3px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#0052CC',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Admin
                </div>
              )}
            </div>

            <div style={{ padding: '4px 0' }}>
              <Link
                href="/profile"
                onClick={() => setIsProfileOpen(false)}
                style={{
                  width: '100%',
                  padding: '8px 16px',
                  background: 'transparent',
                  border: 'none',
                  display: 'block',
                  textAlign: 'left',
                  textDecoration: 'none',
                  fontSize: '14px',
                  color: '#172B4D',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#F4F5F7'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Profile
              </Link>

              {/* Per-user, not per-project — so it lives under the profile. */}
              <Link
                href="/profile/notifications"
                onClick={() => setIsProfileOpen(false)}
                style={{
                  width: '100%',
                  padding: '8px 16px',
                  background: 'transparent',
                  border: 'none',
                  display: 'block',
                  textAlign: 'left',
                  textDecoration: 'none',
                  fontSize: '14px',
                  color: '#172B4D',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#F4F5F7'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Notification preferences
              </Link>
            </div>

            {/* Install-wide screens. They live here rather than in the sidebar,
                which is per-project: global items there invited the reading that
                they applied to the project you were in. Only global admins see
                this; /admin/layout.tsx enforces the same rule on every route
                under /admin, so this is presentation, not access control. */}
            {user?.role === 'admin' && (
              <div style={{ borderTop: '1px solid #EBECF0', padding: '4px 0' }}>
                <div
                  style={{
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#5E6C84',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Global Admin
                </div>

                {[
                  { href: '/admin/settings', label: 'Global Settings' },
                  { href: '/admin/team-management', label: 'Team Management' },
                  { href: '/admin/team-view', label: 'Team View' },
                  { href: '/standup?manage=1', label: 'Standup People' },
                  // Only an install with a Google Workspace has a directory to sync.
                  ...(hasGoogleWorkspace
                    ? [{ href: '/admin/google-workspace', label: 'Google Workspace' }]
                    : []),
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsProfileOpen(false)}
                    style={{
                      width: '100%',
                      padding: '8px 16px',
                      background: 'transparent',
                      border: 'none',
                      display: 'block',
                      textAlign: 'left',
                      textDecoration: 'none',
                      fontSize: '14px',
                      color: '#172B4D',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#F4F5F7'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

            <div style={{ borderTop: '1px solid #EBECF0', padding: '4px 0' }}>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  padding: '8px 16px',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: '#DE350B',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(222, 53, 11, 0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
