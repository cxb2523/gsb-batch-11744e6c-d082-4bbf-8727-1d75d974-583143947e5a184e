'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useProjectContext } from '../hooks/useProjectContext';
import { useNavigationConfig } from '../hooks/useNavigationConfig';
import { NAV_CATALOG, NAV_SECTION_LABELS, isNavItemVisible } from '../lib/navigation';

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
  section?: 'planning' | 'development' | 'operations' | 'project';
}

export function CollapsibleSidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  // Resolved once for the whole tree by ProjectProvider — no per-navigation refetch.
  const { selectedProject } = useProjectContext();
  // Install-wide visibility. Updates as soon as an admin saves, in their own tab.
  const { config: navigationConfig } = useNavigationConfig();

  // Load collapse state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem('sidebarCollapsed');
    if (savedState !== null) {
      setIsCollapsed(JSON.parse(savedState));
    }
  }, []);

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', JSON.stringify(newState));
  };

  // The catalogue lives in code (src/lib/navigation.ts); the backend only says which
  // ids are hidden. So the labels and hrefs here cannot be broken by a bad config.
  const navigationItems: NavigationItem[] = selectedProject
    ? NAV_CATALOG.filter((item) => isNavItemVisible(item, navigationConfig)).map((item) => ({
        id: item.id,
        label: item.label,
        icon: item.icon,
        href: item.href(selectedProject.id),
        section: item.section,
      }))
    : [];

  // Install-wide screens are NOT here. The sidebar is per-project, so global items
  // in it read as if they applied to the project you are in. They live in the
  // profile dropdown instead, shown only to global admins.
  const sections = [
    { id: 'planning', label: NAV_SECTION_LABELS.planning, items: navigationItems.filter(i => i.section === 'planning') },
    { id: 'development', label: NAV_SECTION_LABELS.development, items: navigationItems.filter(i => i.section === 'development') },
    { id: 'operations', label: NAV_SECTION_LABELS.operations, items: navigationItems.filter(i => i.section === 'operations') },
    { id: 'project', label: NAV_SECTION_LABELS.project, items: navigationItems.filter(i => i.section === 'project') },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const getProjectAvatar = (project: { key: string }) => {
    return project.key.slice(0, 2).toUpperCase();
  };

  return (
    <div
      style={{
        width: isCollapsed ? '60px' : '240px',
        minWidth: isCollapsed ? '60px' : '240px',
        height: 'calc(100vh - 56px)', // Account for top nav
        background: '#FFFFFF',
        borderRight: '1px solid #DFE1E6',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 200ms cubic-bezier(0.2, 0, 0, 1)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Collapse Button */}
      <button
        onClick={toggleCollapse}
        style={{
          width: '100%',
          height: '40px',
          background: 'transparent',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-end',
          padding: isCollapsed ? '0' : '0 16px',
          cursor: 'pointer',
          color: '#42526E',
          transition: 'background-color 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#F4F5F7'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
      </button>

      {/* Project Header */}
      {selectedProject && (
        <div
          style={{
            padding: isCollapsed ? '12px 0' : '12px 16px',
            borderBottom: '1px solid #EBECF0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: isCollapsed ? 'center' : 'flex-start',
            gap: '8px',
            flexShrink: 0,
          }}
        >
          {/* Project Avatar */}
          <div
            style={{
              width: isCollapsed ? '32px' : '40px',
              height: isCollapsed ? '32px' : '40px',
              borderRadius: '3px',
              background: '#0052CC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: isCollapsed ? '12px' : '14px',
              fontWeight: 700,
              color: '#FFFFFF',
              flexShrink: 0,
            }}
          >
            {getProjectAvatar(selectedProject)}
          </div>

          {/* Project Name (only when expanded) */}
          {!isCollapsed && (
            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#172B4D',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                width: '100%',
              }}
            >
              {selectedProject.name}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 0',
        }}
      >
        {navigationItems.length > 0 ? (
          sections.map((section) => (
            section.items.length > 0 && (
              <div key={section.id} style={{ marginBottom: '16px' }}>
                {/* Section Header (only when expanded) */}
                {!isCollapsed && (
                  <div
                    style={{
                      padding: '16px 12px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#5E6C84',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {section.label}
                  </div>
                )}

                {/* Section Items */}
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        height: '40px',
                        padding: isCollapsed ? '0' : '0 12px',
                        margin: '2px 8px',
                        borderRadius: '6px',
                        textDecoration: 'none',
                        fontSize: '14px',
                        fontWeight: active ? 600 : 500,
                        color: active ? '#0C66E4' : '#44546F',
                        background: active ? '#E9F2FF' : 'transparent',
                        transition: 'background-color 0.15s, color 0.15s',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = '#F1F2F4';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <Icon size={20} style={{ flexShrink: 0 }} />
                      {!isCollapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}

                      {/* Tooltip for collapsed state */}
                      {isCollapsed && (
                        <div
                          className="sidebar-tooltip"
                          style={{
                            position: 'absolute',
                            left: '100%',
                            marginLeft: '8px',
                            padding: '4px 8px',
                            background: '#172B4D',
                            color: '#FFFFFF',
                            fontSize: '12px',
                            borderRadius: '3px',
                            whiteSpace: 'nowrap',
                            opacity: 0,
                            pointerEvents: 'none',
                            transition: 'opacity 0.15s',
                            zIndex: 1000,
                          }}
                        >
                          {item.label}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            )
          ))
        ) : (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              fontSize: '14px',
              color: '#5E6C84',
            }}
          >
            {!isCollapsed && 'Select a project to view navigation'}
          </div>
        )}
      </nav>

      {/* Add CSS for tooltip hover effect */}
      <style>{`
        a:hover .sidebar-tooltip {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  );
}
