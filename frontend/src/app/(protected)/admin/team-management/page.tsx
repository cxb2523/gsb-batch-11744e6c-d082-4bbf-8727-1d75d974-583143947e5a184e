'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Edit2, ToggleLeft, ToggleRight, Cloud, RefreshCw, UserPlus, Users } from 'lucide-react';
import { skillsAPI, EmployeeProfile } from '../../../../lib/api/skills';
import { getAllUsers, updateUser, UserOut } from '@/lib/api/admin';
import CreateUserModal from '@/components/CreateUserModal';
import { tokens } from '../../../../design-system/tokens';
import { useHasGoogleWorkspace } from '@/hooks/useCapabilities';
import { ButtonCore } from '@/components/ui';

type SortMode = 'default' | 'name-asc' | 'name-desc';

export default function TeamManagementPage() {
  // Both Google buttons below talk to /google-sync, which 404s on an install with no
  // Workspace configured. Nothing else on this page depends on Google.
  const hasGoogleWorkspace = useHasGoogleWorkspace();
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOut[]>([]);
  const [showCreateUser, setShowCreateUser] = useState(false);

  // Filtering + sorting
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortMode>('default');

  // Inline expansion
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  // Profile editing
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeProfile | null>(null);
  const [editingDesignation, setEditingDesignation] = useState('');
  const [editingDepartment, setEditingDepartment] = useState('');

  const commonDesignations = [
    'Junior Developer', 'Developer', 'Senior Developer', 'Tech Lead',
    'Lead Developer', 'Principal Engineer', 'Staff Engineer', 'Junior Engineer',
    'Software Engineer', 'Senior Engineer', 'Associate Engineer',
  ];
  const departments = ['Engineering', 'Design', 'QA', 'DevOps', 'Management', 'Product'];

  const rightPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadData(); }, []);

  // Close side panel on Escape or click outside the right card
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedEmail(null); };
    const onPointerDown = (e: MouseEvent) => {
      if (expandedEmail && rightPanelRef.current && !rightPanelRef.current.contains(e.target as Node)) {
        setExpandedEmail(null);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [expandedEmail]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [employeesData, usersData] = await Promise.all([
        skillsAPI.getEmployees(),
        getAllUsers(),
      ]);
      setEmployees(employeesData);
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const getUserData = (email: string): UserOut | undefined =>
    users.find(u => u.email === email);

  const handleToggleUserActive = async (userEmail: string, currentStatus: boolean) => {
    try {
      const user = getUserData(userEmail);
      if (!user) { alert('User not found. Please refresh.'); return; }
      await updateUser(user.email, { is_active: !currentStatus });
      setUsers(await getAllUsers());
    } catch {
      alert('Failed to update user status. Please try again.');
    }
  };

  const handleUpdateProfile = async () => {
    if (!editingEmployee) return;
    try {
      const updated = await skillsAPI.updateUserProfile(editingEmployee.id, {
        designation: editingDesignation || undefined,
        department: editingDepartment || undefined,
      });
      setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e));
      setShowEditProfile(false);
    } catch (err: any) {
      alert(err.message || 'Failed to update profile');
    }
  };

  const handleTestGoogleConnection = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/google-sync/test-connection`, {
        method: 'GET', credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const result = await res.json();
      alert(`✓ Google Workspace connection successful!\n\n${result.message}`);
    } catch (err: any) {
      alert(`✗ Google Workspace connection failed:\n\n${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncGoogleWorkspace = async () => {
    if (!confirm('This will sync users from Google Workspace. Continue?')) return;
    try {
      setLoading(true);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/google-sync/users`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const result = await res.json();
      alert(`✓ Sync complete!\n\nCreated: ${result.stats.created}\nUpdated: ${result.stats.updated}\nSkipped: ${result.stats.skipped}\nErrors: ${result.stats.errors.length}`);
      await loadData();
    } catch (err: any) {
      alert(`✗ Sync failed:\n\n${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Department stats
  const deptStats = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach(e => {
      const dept = e.department || 'No Department';
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [employees]);

  const activeCount = useMemo(() =>
    employees.filter(e => getUserData(e.email)?.is_active !== false).length,
  [employees, users]);

  // Filtered + sorted list
  const displayList = useMemo(() => {
    let list = [...employees];
    if (selectedDepartment) {
      list = list.filter(e => (e.department || 'No Department') === selectedDepartment);
    }
    list.sort((a, b) => {
      const aActive = getUserData(a.email)?.is_active !== false;
      const bActive = getUserData(b.email)?.is_active !== false;
      // Inactive always at bottom
      if (aActive !== bActive) return aActive ? -1 : 1;
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      return 0;
    });
    return list;
  }, [employees, users, selectedDepartment, sortBy]);


  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: tokens.colors.semantic.text.tertiary }}>
        Loading team management...
      </div>
    );
  }

  return (
    <div style={{ padding: '32px', fontFamily: tokens.fontFamily.sans, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: tokens.colors.semantic.text.primary, marginBottom: 4 }}>
            Team Management
          </h1>
          <p style={{ fontSize: 14, color: tokens.colors.semantic.text.tertiary }}>
            Manage team members, roles, and access
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {hasGoogleWorkspace && (
            <>
          <ButtonCore
            variant="secondary"
            onClick={handleTestGoogleConnection}
            leftIcon={<Cloud size={15} />}
          >
            Test Connection
          </ButtonCore>
          <ButtonCore
            variant="secondary"
            onClick={handleSyncGoogleWorkspace}
            leftIcon={<RefreshCw size={15} />}
          >
            Sync Google
          </ButtonCore>
            </>
          )}
          <ButtonCore
            variant="primary"
            onClick={() => setShowCreateUser(true)}
            leftIcon={<UserPlus size={15} />}
          >
            Create User
          </ButtonCore>
        </div>
      </div>

      {error && (
        <div style={{
          padding: 12, backgroundColor: tokens.colors.error[50],
          border: `1px solid ${tokens.colors.error[200]}`,
          borderRadius: 8, color: tokens.colors.error[700], marginBottom: 16, flexShrink: 0,
        }}>
          {error}
        </div>
      )}

      {/* Main layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, flex: 1, minHeight: 0 }}>
        {/* Left — At a Glance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          {/* Summary stats */}
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: 12,
            border: '1px solid rgba(0,0,0,0.08)',
            padding: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Users size={14} color={tokens.colors.semantic.text.tertiary} />
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: tokens.colors.semantic.text.tertiary }}>
                At a Glance
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <div style={{ padding: '12px 16px', backgroundColor: '#f8faff', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: tokens.colors.semantic.text.secondary, fontWeight: 500 }}>Total Members</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: tokens.colors.primary[600] }}>{employees.length}</div>
              </div>
              <div style={{ padding: '12px 16px', backgroundColor: 'rgba(16,185,129,0.07)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: tokens.colors.semantic.text.secondary, fontWeight: 500 }}>Active Members</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#10B981' }}>{activeCount}</div>
              </div>
            </div>

            {/* Department filter */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: tokens.colors.semantic.text.tertiary, marginBottom: 8 }}>
              Departments
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* All */}
              <button
                onClick={() => setSelectedDepartment(null)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: selectedDepartment === null ? 600 : 400,
                  backgroundColor: selectedDepartment === null ? tokens.colors.primary[50] : 'transparent',
                  color: selectedDepartment === null ? tokens.colors.primary[700] : tokens.colors.semantic.text.primary,
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background-color 0.15s',
                }}
              >
                <span>All</span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '1px 7px',
                  borderRadius: 10,
                  backgroundColor: selectedDepartment === null ? tokens.colors.primary[100] : 'rgba(0,0,0,0.06)',
                  color: selectedDepartment === null ? tokens.colors.primary[700] : tokens.colors.semantic.text.tertiary,
                }}>
                  {employees.length}
                </span>
              </button>

              {deptStats.map(([dept, count]) => (
                <button
                  key={dept}
                  onClick={() => setSelectedDepartment(prev => prev === dept ? null : dept)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '7px 10px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: selectedDepartment === dept ? 600 : 400,
                    backgroundColor: selectedDepartment === dept ? tokens.colors.primary[50] : 'transparent',
                    color: selectedDepartment === dept ? tokens.colors.primary[700] : tokens.colors.semantic.text.primary,
                    textAlign: 'left',
                    width: '100%',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedDepartment !== dept) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)';
                  }}
                  onMouseLeave={(e) => {
                    if (selectedDepartment !== dept) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span>{dept}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '1px 7px',
                    borderRadius: 10,
                    backgroundColor: selectedDepartment === dept ? tokens.colors.primary[100] : 'rgba(0,0,0,0.06)',
                    color: selectedDepartment === dept ? tokens.colors.primary[700] : tokens.colors.semantic.text.tertiary,
                  }}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right — Team Members */}
        <div ref={rightPanelRef} style={{
          backgroundColor: '#ffffff',
          borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* List header */}
          <div style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(0,0,0,0.07)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: tokens.colors.semantic.text.primary, margin: 0 }}>
              {selectedDepartment ? selectedDepartment : 'All Members'}
              <span style={{ fontSize: 13, fontWeight: 400, color: tokens.colors.semantic.text.tertiary, marginLeft: 8 }}>
                {displayList.length}
              </span>
            </h2>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortMode)}
              style={{
                padding: '5px 10px',
                fontSize: 12,
                fontWeight: 500,
                color: tokens.colors.semantic.text.primary,
                backgroundColor: '#ffffff',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: 6,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="default">Sort: Default</option>
              <option value="name-asc">Name A–Z</option>
              <option value="name-desc">Name Z–A</option>
            </select>
          </div>

          {/* List + side detail */}
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* Scrollable member list */}
            <div style={{ overflowY: 'auto', flex: expandedEmail ? '0 0 340px' : '1', borderRight: expandedEmail ? '1px solid rgba(0,0,0,0.07)' : 'none' }}>
              {displayList.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: tokens.colors.semantic.text.tertiary, fontSize: 14 }}>
                  No members in this department.
                </div>
              )}
              {displayList.map((employee) => {
                const userData = getUserData(employee.email);
                const isActive = userData?.is_active !== false;
                const isSelected = expandedEmail === employee.email;

                return (
                  <div
                    key={employee.email}
                    onClick={() => setExpandedEmail(prev => prev === employee.email ? null : employee.email)}
                    style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid rgba(0,0,0,0.05)',
                      backgroundColor: isSelected ? 'rgba(59,130,246,0.06)' : 'transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'background-color 0.15s',
                      opacity: isActive ? 1 : 0.55,
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.02)'; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      backgroundColor: isActive ? tokens.colors.primary[500] : tokens.colors.neutral[400],
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      {employee.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>

                    {/* Name + email */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: tokens.colors.semantic.text.primary }}>
                        {employee.name}
                      </div>
                      <div style={{ fontSize: 12, color: tokens.colors.semantic.text.tertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {employee.email}
                      </div>
                    </div>

                    {/* Active toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleUserActive(employee.email, isActive);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: isActive ? '#10B981' : tokens.colors.semantic.text.tertiary,
                        backgroundColor: isActive ? 'rgba(16,185,129,0.12)' : 'rgba(156,163,175,0.15)',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'all 0.2s',
                      }}
                    >
                      {isActive ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                      {isActive ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Side detail panel */}
            {expandedEmail && (() => {
              const emp = employees.find(e => e.email === expandedEmail);
              if (!emp) return null;
              const userData = getUserData(emp.email);
              const isActive = userData?.is_active !== false;
              return (
                <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        backgroundColor: isActive ? tokens.colors.primary[500] : tokens.colors.neutral[400],
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}>
                        {emp.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: tokens.colors.semantic.text.primary }}>
                          {emp.name}
                        </div>
                        <div style={{ fontSize: 13, color: tokens.colors.semantic.text.tertiary }}>
                          {emp.email}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandedEmail(null)}
                      style={{
                        padding: '5px 7px', backgroundColor: tokens.colors.error[50],
                        border: `1px solid ${tokens.colors.error[200]}`,
                        borderRadius: 6, cursor: 'pointer', color: tokens.colors.error[500],
                        display: 'flex', alignItems: 'center', flexShrink: 0,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.colors.error[100];
                        (e.currentTarget as HTMLButtonElement).style.color = tokens.colors.error[700];
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.backgroundColor = tokens.colors.error[50];
                        (e.currentTarget as HTMLButtonElement).style.color = tokens.colors.error[500];
                      }}
                      title="Close (Esc)"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Badges + Edit */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
                    {emp.designation ? (
                      <span style={{
                        padding: '4px 10px', backgroundColor: tokens.colors.primary[50],
                        color: tokens.colors.primary[700], fontSize: 12, fontWeight: 600, borderRadius: 4,
                      }}>
                        {emp.designation}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: tokens.colors.semantic.text.tertiary, fontStyle: 'italic' }}>
                        No designation set
                      </span>
                    )}
                    {emp.department && (
                      <span style={{
                        padding: '4px 10px', backgroundColor: tokens.colors.neutral[100],
                        color: tokens.colors.neutral[600], fontSize: 12, fontWeight: 500, borderRadius: 4,
                      }}>
                        {emp.department}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setEditingEmployee(emp);
                        setEditingDesignation(emp.designation || '');
                        setEditingDepartment(emp.department || '');
                        setShowEditProfile(true);
                      }}
                      style={{
                        padding: '4px 8px', backgroundColor: 'transparent',
                        color: tokens.colors.primary[600], border: `1px solid ${tokens.colors.primary[300]}`,
                        borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Edit2 size={11} />
                      Edit Profile
                    </button>
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1, padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }}>
                      <div style={{ fontSize: 10, color: tokens.colors.semantic.text.tertiary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Active Tickets
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: tokens.colors.semantic.text.primary }}>
                        {emp.availability?.current_workload ?? 0}
                      </div>
                    </div>
                    <div style={{ flex: 1, padding: '12px 16px', backgroundColor: '#f9fafb', borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }}>
                      <div style={{ fontSize: 10, color: tokens.colors.semantic.text.tertiary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Completed
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: tokens.colors.semantic.text.primary }}>
                        {emp.total_tickets_completed}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Create User Modal */}
      <CreateUserModal
        isOpen={showCreateUser}
        onClose={() => setShowCreateUser(false)}
        onCreated={loadData}
      />

      {/* Edit Profile Modal */}
      {showEditProfile && editingEmployee && (
        <>
          <div
            onClick={() => setShowEditProfile(false)}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999,
            }}
          />
          <div
            style={{
              position: 'fixed', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: 'white', borderRadius: 12, padding: 24,
              width: '90%', maxWidth: 500, zIndex: 1000,
              boxShadow: tokens.shadows['2xl'],
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: tokens.colors.semantic.text.primary, margin: 0 }}>
                Edit Profile — {editingEmployee.name}
              </h3>
              <button
                onClick={() => setShowEditProfile(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: tokens.colors.semantic.text.tertiary }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: tokens.colors.semantic.text.secondary, marginBottom: 6 }}>
                Designation
              </label>
              <input
                type="text"
                list="designations"
                value={editingDesignation}
                onChange={(e) => setEditingDesignation(e.target.value)}
                placeholder="e.g., Senior Developer"
                style={{
                  width: '100%', padding: '8px 12px',
                  border: `1px solid ${tokens.colors.semantic.border.default}`,
                  borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              <datalist id="designations">
                {commonDesignations.map(des => <option key={des} value={des} />)}
              </datalist>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: tokens.colors.semantic.text.secondary, marginBottom: 6 }}>
                Department
              </label>
              <select
                value={editingDepartment}
                onChange={(e) => setEditingDepartment(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px',
                  border: `1px solid ${tokens.colors.semantic.border.default}`,
                  borderRadius: 6, fontSize: 14, fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Select Department</option>
                {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <ButtonCore variant="secondary" onClick={() => setShowEditProfile(false)}>
                Cancel
              </ButtonCore>
              <ButtonCore variant="primary" onClick={handleUpdateProfile}>
                Save Changes
              </ButtonCore>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
