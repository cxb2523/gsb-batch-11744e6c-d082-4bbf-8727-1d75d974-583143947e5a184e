'use client';

import React, { useState, useEffect } from 'react';
import { epicsApi, CreateEpicRequest } from '@/lib/api/epics';
import { membersAPI, ProjectMember } from '@/lib/api/settings';
import { X, Check } from 'lucide-react';
import { todayLocal } from '@/lib/date';
import { ButtonCore } from '@/components/ui';

interface CreateEpicModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onEpicCreated?: () => void;
}

const EPIC_COLORS = [
  { name: 'Blue', value: '#155dfc' },
  { name: 'Purple', value: '#7c3aed' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Gray', value: '#6b7280' },
];

const EPIC_STATUSES = [
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

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

export const CreateEpicModal: React.FC<CreateEpicModalProps> = ({
  isOpen,
  onClose,
  projectId,
  onEpicCreated,
}) => {
  const [formData, setFormData] = useState<CreateEpicRequest>({
    title: '',
    description: '',
    color: '#155dfc',
    status: 'planned',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);

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

  // Fetch members when modal opens (for the epic owner selector)
  useEffect(() => {
    if (isOpen && projectId) {
      const fetchData = async () => {
        try {
          const fetchedMembers = await membersAPI.getMembers(projectId);
          setMembers(fetchedMembers);
        } catch (err) {
          console.error('Failed to fetch data:', err);
        }
      };

      fetchData();
    }
  }, [isOpen, projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim()) {
      setError('Epic title is required');
      return;
    }

    // Dates are optional for epics, but when present can't be in the past and the
    // due date can't precede the start date. YYYY-MM-DD strings compare with <.
    const today = todayLocal();
    if (formData.start_date && formData.start_date < today) {
      setError('Start date cannot be in the past');
      return;
    }
    if (formData.due_date && formData.due_date < today) {
      setError('Due date cannot be in the past');
      return;
    }
    if (formData.due_date && formData.start_date && formData.due_date < formData.start_date) {
      setError('Due date cannot be before the start date');
      return;
    }

    setIsSubmitting(true);

    try {
      // Create epic
      await epicsApi.createEpic(projectId, {
        ...formData,
        title: formData.title.trim(),
      });

      // Reset form
      setFormData({
        title: '',
        description: '',
        color: '#155dfc',
        status: 'planned',
      });

      onEpicCreated?.();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create epic');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        title: '',
        description: '',
        color: '#155dfc',
        status: 'planned',
      });
      setError(null);
      onClose();
    }
  };

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
        maxWidth: 560,
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
            Create epic
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

            {/* Title */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Title <span style={{ color: '#DE350B' }}>*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter epic title"
                disabled={isSubmitting}
                style={inputBaseStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the epic and its goals"
                rows={4}
                disabled={isSubmitting}
                style={{
                  ...inputBaseStyle,
                  resize: 'vertical',
                  fontFamily: 'var(--font-sans)',
                }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>

            {/* Status */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                disabled={isSubmitting}
                style={inputBaseStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              >
                {EPIC_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Color */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Color
              </label>
              <div style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}>
                {EPIC_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: color.value })}
                    disabled={isSubmitting}
                    style={{
                      width: 28,
                      height: 28,
                      backgroundColor: color.value,
                      border: formData.color === color.value
                        ? '2px solid #172B4D'
                        : '1px solid #DFE1E6',
                      borderRadius: 3,
                      cursor: isSubmitting ? 'not-allowed' : 'pointer',
                      padding: 0,
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title={color.name}
                  >
                    {formData.color === color.value && (
                      <Check size={14} color="#FFFFFF" strokeWidth={3} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Owner/Assignee */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Owner
              </label>
              <select
                value={formData.assignee_id || ''}
                onChange={(e) => setFormData({ ...formData, assignee_id: e.target.value ? Number(e.target.value) : undefined })}
                disabled={isSubmitting}
                style={inputBaseStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              >
                <option value="">Unassigned</option>
                {members.filter(m => m.active !== false).map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Dates */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 16,
            }}>
              {/* Start Date */}
              <div>
                <label style={labelStyle}>
                  Start date
                </label>
                <input
                  type="date"
                  value={formData.start_date || ''}
                  min={todayLocal()}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  disabled={isSubmitting}
                  style={inputBaseStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              {/* Due Date */}
              <div>
                <label style={labelStyle}>
                  Due date
                </label>
                <input
                  type="date"
                  value={formData.due_date || ''}
                  min={formData.start_date || todayLocal()}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  disabled={isSubmitting}
                  style={inputBaseStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>
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
              disabled={!formData.title.trim()}
              loading={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create epic'}
            </ButtonCore>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEpicModal;
