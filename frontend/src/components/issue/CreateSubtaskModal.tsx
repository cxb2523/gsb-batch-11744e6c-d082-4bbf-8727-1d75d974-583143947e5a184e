'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ButtonCore } from '@/components/ui';
import { subtasksAPI, SubtaskPriority } from '../../lib/api/subtasks';
import RichTextEditor from '../RichTextEditor';
import { membersAPI, ProjectMember } from '../../lib/api/settings';
import { tokens } from '../../design-system/tokens';
import { PRIORITY_OPTIONS } from '../../lib/priority';
import { todayLocal } from '../../lib/date';

interface CreateSubtaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  parentIssueId: number;
  onSubtaskCreated: (subtaskId: number) => void;
}

export default function CreateSubtaskModal({
  isOpen,
  onClose,
  projectId,
  parentIssueId,
  onSubtaskCreated,
}: CreateSubtaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [priority, setPriority] = useState<SubtaskPriority>('medium');
  const [dueDate, setDueDate] = useState<string>('');
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadMembers();
      // Reset form when opened
      setTitle('');
      setDescription('');
      setAssigneeId(null);
      setPriority('medium');
      setDueDate('');
      setError(null);
    }
  }, [isOpen, projectId]);

  const loadMembers = async () => {
    try {
      const data = await membersAPI.getMembers(projectId);
      setMembers(data);
    } catch (err) {
      console.error('Failed to load members:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (dueDate && dueDate < todayLocal()) {
      setError('Due date cannot be in the past');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      // Resolve assignee numeric id to email (API now keys assignee by email).
      const selectedMember = assigneeId
        ? members.find((m) => m.user_id === assigneeId)
        : null;

      const createdSubtask = await subtasksAPI.create(projectId, parentIssueId, {
        title: title.trim(),
        description: description.trim() || undefined,
        assignee_email: selectedMember?.email,
        priority,
        due_date: dueDate || undefined,
      });

      onSubtaskCreated(createdSubtask.id);
      onClose();
    } catch (err) {
      console.error('Failed to create subtask:', err);
      setError(err instanceof Error ? err.message : 'Failed to create subtask');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
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
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: 12,
          width: '100%',
          maxWidth: 600,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: tokens.colors.neutral[900],
            }}
          >
            Create Subtask
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              color: tokens.colors.neutral[500],
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = tokens.colors.neutral[100];
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {error && (
            <div
              style={{
                padding: 12,
                backgroundColor: tokens.colors.error[50],
                color: tokens.colors.error[700],
                borderRadius: 8,
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {/* Title */}
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="subtask-title"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: tokens.colors.neutral[700],
                marginBottom: 8,
              }}
            >
              Title *
            </label>
            <input
              id="subtask-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter subtask title..."
              autoFocus
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: `1px solid ${tokens.colors.neutral[300]}`,
                borderRadius: 8,
                outline: 'none',
                fontFamily: tokens.fontFamily.sans,
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.primary[500];
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.neutral[300];
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="subtask-description"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: tokens.colors.neutral[700],
                marginBottom: 8,
              }}
            >
              Description
            </label>
            <RichTextEditor
              projectId={projectId}
              value={description}
              onChange={setDescription}
              placeholder="Enter description (optional)... Use @ to mention team members"
              style={{
                width: '100%',
                minHeight: 100,
                padding: '10px 12px',
                fontSize: 14,
                border: `1px solid ${tokens.colors.neutral[300]}`,
                borderRadius: 8,
                outline: 'none',
                fontFamily: tokens.fontFamily.sans,
                color: tokens.colors.neutral[900],
                lineHeight: '1.6',
              }}
            />
          </div>

          {/* Assignee */}
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="subtask-assignee"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: tokens.colors.neutral[700],
                marginBottom: 8,
              }}
            >
              Assignee
            </label>
            <select
              id="subtask-assignee"
              value={assigneeId || ''}
              onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : null)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: `1px solid ${tokens.colors.neutral[300]}`,
                borderRadius: 8,
                outline: 'none',
                fontFamily: tokens.fontFamily.sans,
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.primary[500];
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.neutral[300];
              }}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.name} ({member.role})
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="subtask-priority"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: tokens.colors.neutral[700],
                marginBottom: 8,
              }}
            >
              Priority
            </label>
            <select
              id="subtask-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as SubtaskPriority)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: `1px solid ${tokens.colors.neutral[300]}`,
                borderRadius: 8,
                outline: 'none',
                fontFamily: tokens.fontFamily.sans,
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.primary[500];
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.neutral[300];
              }}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Due Date */}
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="subtask-due-date"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: tokens.colors.neutral[700],
                marginBottom: 8,
              }}
            >
              Due Date
            </label>
            <input
              id="subtask-due-date"
              type="date"
              value={dueDate}
              min={todayLocal()}
              onChange={(e) => setDueDate(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: `1px solid ${tokens.colors.neutral[300]}`,
                borderRadius: 8,
                outline: 'none',
                fontFamily: tokens.fontFamily.sans,
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.primary[500];
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = tokens.colors.neutral[300];
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <ButtonCore variant="secondary" onClick={onClose} disabled={creating}>
              Cancel
            </ButtonCore>
            <ButtonCore type="submit" variant="primary" disabled={!title.trim() || creating}>
              {creating ? 'Creating...' : 'Create Subtask'}
            </ButtonCore>
          </div>
        </form>
      </div>
    </div>
  );
}
