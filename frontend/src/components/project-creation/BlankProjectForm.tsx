'use client';

import React, { useState, useEffect } from 'react';
import { Lock, ChevronLeft } from 'lucide-react';
import { Card } from '@/design-system/components/Card';
import { ButtonCore } from '@/components/ui';
import { Input } from '@/design-system/components/Input';
import { colors } from '@/design-system/tokens';
import { membersAPI, AvailableUser } from '@/lib/api/settings';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from '@/lib/api/client';

type ProjectRole = 'admin' | 'member' | 'viewer';

interface BlankProjectFormProps {
  onBack: () => void;
}

export const BlankProjectForm: React.FC<BlankProjectFormProps> = ({ onBack }) => {
  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignableUsers, setAssignableUsers] = useState<AvailableUser[]>([]);
  // user_id -> project role, for the members chosen to add at creation
  const [memberRoles, setMemberRoles] = useState<Record<number, ProjectRole>>({});
  const [loadingUsers, setLoadingUsers] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchAssignableUsers();
  }, []);

  const fetchAssignableUsers = async () => {
    try {
      // Excludes global admins (they already have access to every project).
      const users = await membersAPI.getAssignableUsers();
      setAssignableUsers(users);
    } catch (err) {
      console.error('Failed to fetch assignable users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleProjectKeyChange = (value: string) => {
    // Auto-generate key from name if key is empty
    const sanitized = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setProjectKey(sanitized);
  };

  const handleProjectNameChange = (value: string) => {
    setProjectName(value);
    if (!projectKey) {
      // Auto-generate key from first letters of words
      const words = value.split(/\s+/);
      const key = words
        .map((word) => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 8);
      setProjectKey(key);
    }
  };

  const toggleMember = (userId: number) => {
    setMemberRoles((prev) => {
      const next = { ...prev };
      if (userId in next) {
        delete next[userId];
      } else {
        next[userId] = 'member';
      }
      return next;
    });
  };

  const setMemberRole = (userId: number, role: ProjectRole) => {
    setMemberRoles((prev) => ({ ...prev, [userId]: role }));
  };

  const selectedCount = Object.keys(memberRoles).length;

  // The ghost Button variant is tuned for dark surfaces (near-white text), so it's
  // almost invisible on this white page. Override Cancel to a visible outline.
  const handleCreateProject = async () => {
    if (!projectName.trim() || !projectKey.trim()) {
      setError('Project name and key are required');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/projects`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          key: projectKey,
          description: description || undefined,
          visibility: 'private',
          members: Object.entries(memberRoles).map(([id, role]) => ({ user_id: Number(id), role })),
          deadline: deadline ? new Date(deadline).toISOString() : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Failed to create project' }));
        throw new Error(errorData.detail || 'Failed to create project');
      }

      const result = await response.json();

      // Save the project ID to localStorage
      localStorage.setItem('selectedProjectId', result.id.toString());

      // Redirect to the new project's board page
      router.push(`/projects/${result.id}/board`);
    } catch (err: any) {
      setError(err.message || 'Failed to create project. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
      <ButtonCore
        variant="ghost"
        onClick={onBack}
        style={{ marginBottom: '24px', gap: '4px', paddingLeft: 0 }}
        disabled={isCreating}
      >
        <ChevronLeft size={18} />
        Back
      </ButtonCore>

      <div style={{ marginBottom: '32px' }}>
        <h1
          style={{
            fontSize: '30px',
            fontWeight: 600,
            color: colors.semantic.text.primary,
            marginBottom: '8px',
          }}
        >
          Create Blank Project
        </h1>
        <p style={{ fontSize: '15px', color: colors.semantic.text.secondary }}>
          Create a new project with basic details. You can add epics and tickets later.
        </p>
      </div>

      {/* Project Details */}
      <Card style={{ padding: '24px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: colors.semantic.text.primary, marginBottom: '20px' }}>
          Project Details
        </h2>

        <div style={{ marginBottom: '20px' }}>
          <Input
            label="Project Name"
            requiredMark
            value={projectName}
            onChange={(e) => handleProjectNameChange(e.target.value)}
            placeholder="e.g., Customer Portal Redesign"
            disabled={isCreating}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <Input
            label="Project Key"
            requiredMark
            value={projectKey}
            onChange={(e) => handleProjectKeyChange(e.target.value)}
            placeholder="e.g., CPR"
            helperText="Short identifier (max 8 characters, letters and numbers only)"
            disabled={isCreating}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '6px',
              fontSize: '12px',
              color: colors.error[600],
            }}
          >
            <Lock size={12} style={{ flexShrink: 0 }} />
            <span>Choose carefully — the project key can&apos;t be changed once the project is created.</span>
          </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: colors.semantic.text.primary }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the project..."
            disabled={isCreating}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: `1px solid ${colors.semantic.border.default}`,
              fontSize: '14px',
              lineHeight: '20px',
              minHeight: '80px',
              resize: 'vertical',
              fontFamily: 'inherit',
              outline: 'none',
              backgroundColor: colors.semantic.background.default,
              color: colors.semantic.text.primary,
            }}
          />
        </div>

        <div>
          <Input
            label="Deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            // Open the native date picker when clicking anywhere in the field, not
            // just the calendar icon. Guarded: showPicker throws if not supported
            // or already open.
            onClick={(e) => {
              try {
                (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
              } catch {
                /* ignore — fall back to the native icon */
              }
            }}
            disabled={isCreating}
            helperText="Optional target completion date for the project"
          />
        </div>
      </Card>

      {/* Team Members */}
      <Card style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: colors.semantic.text.primary, margin: 0 }}>
            Team Members
          </h2>
          {selectedCount > 0 && (
            <div style={{ fontSize: '13px', color: colors.semantic.text.tertiary }}>
              {selectedCount} selected
            </div>
          )}
        </div>

        {loadingUsers ? (
          <div style={{ textAlign: 'center', padding: '20px', color: colors.semantic.text.secondary }}>
            Loading team members...
          </div>
        ) : assignableUsers.length > 0 ? (
          <>
            <p style={{ fontSize: '13px', color: colors.semantic.text.secondary, marginBottom: '16px' }}>
              Select who should be on this project and their role. You can change this later.
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                // Keep the card compact: once past 7 people, scroll the list
                // instead of letting it grow the whole page.
                ...(assignableUsers.length > 7
                  ? { maxHeight: '460px', overflowY: 'auto', paddingRight: '6px' }
                  : {}),
              }}
            >
              {assignableUsers.map((member) => {
                const isSelected = member.user_id in memberRoles;

                return (
                  <div
                    key={member.user_id}
                    style={{
                      padding: '12px 16px',
                      border: `2px solid ${isSelected ? colors.primary[500] : colors.semantic.border.default}`,
                      borderRadius: '8px',
                      backgroundColor: isSelected ? colors.primary[50] : colors.semantic.background.default,
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div
                      onClick={() => toggleMember(member.user_id)}
                      style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        style={{ cursor: 'pointer' }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 500, color: colors.semantic.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {member.name}
                        </div>
                        <div style={{ fontSize: '12px', color: colors.semantic.text.tertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {member.email}{member.designation ? ` · ${member.designation}` : ''}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <select
                        value={memberRoles[member.user_id]}
                        onChange={(e) => setMemberRole(member.user_id, e.target.value as ProjectRole)}
                        aria-label={`Role for ${member.name}`}
                        style={{
                          padding: '6px 8px',
                          border: `1px solid ${colors.semantic.border.default}`,
                          borderRadius: '6px',
                          fontSize: '13px',
                          color: colors.semantic.text.primary,
                          background: colors.semantic.background.default,
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="member">Member</option>
                        <option value="admin">Project admin</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px', color: colors.semantic.text.secondary }}>
            No team members available. You can add members later from project settings.
          </div>
        )}
      </Card>

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: colors.error[50],
            border: `1px solid ${colors.error[200]}`,
            borderRadius: '8px',
            color: colors.error[700],
            fontSize: '14px',
            marginBottom: '24px',
          }}
        >
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <ButtonCore
          variant="secondary"
          onClick={onBack}
          disabled={isCreating}
        >
          Cancel
        </ButtonCore>
        <ButtonCore variant="primary" onClick={handleCreateProject} disabled={isCreating || !projectName.trim() || !projectKey.trim()}>
          {isCreating ? 'Creating Project...' : 'Create Project'}
        </ButtonCore>
      </div>
    </div>
  );
};
