'use client';

import React, { useState } from 'react';
import { X, Calendar, Target } from 'lucide-react';
import { sprintsAPI, SprintCreate } from '../lib/api/sprints';
import { ButtonCore } from './ui';

interface CreateSprintModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onSprintCreated?: () => void;
}

export default function CreateSprintModal({
  isOpen,
  onClose,
  projectId,
  onSprintCreated,
}: CreateSprintModalProps) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Sprint name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const sprintData: SprintCreate = {
        name: name.trim(),
        goal: goal.trim() || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      };

      await sprintsAPI.createSprint(projectId, sprintData);

      // Reset form
      setName('');
      setGoal('');
      setStartDate('');
      setEndDate('');

      if (onSprintCreated) {
        onSprintCreated();
      }

      onClose();
    } catch (err) {
      console.error('Failed to create sprint:', err);
      setError('Failed to create sprint. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setName('');
      setGoal('');
      setStartDate('');
      setEndDate('');
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 9998,
          backdropFilter: 'blur(2px)',
        }}
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: '#FFFFFF',
          borderRadius: 8,
          width: '90%',
          maxWidth: 600,
          zIndex: 9999,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
            borderBottom: '1px solid #DFE1E6',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 600,
              color: '#172B4D',
            }}
          >
            Create Sprint
          </h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            style={{
              background: 'none',
              border: 'none',
              padding: 8,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              color: '#5E6C84',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              transition: 'all 0.15s',
              opacity: isSubmitting ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.backgroundColor = '#F4F5F7';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px' }}>
            {/* Error Message */}
            {error && (
              <div
                style={{
                  padding: '12px 16px',
                  marginBottom: 20,
                  backgroundColor: '#FFEBE6',
                  border: '1px solid #FFBDAD',
                  borderRadius: 3,
                  fontSize: 14,
                  color: '#BF2600',
                }}
              >
                {error}
              </div>
            )}

            {/* Sprint Name */}
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="sprint-name"
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#172B4D',
                  marginBottom: 6,
                }}
              >
                Sprint Name <span style={{ color: '#DE350B' }}>*</span>
              </label>
              <input
                id="sprint-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Sprint 1, Q1 Sprint, Feature Release"
                required
                disabled={isSubmitting}
                autoFocus
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 14,
                  color: '#172B4D',
                  backgroundColor: isSubmitting ? '#F4F5F7' : '#FFFFFF',
                  border: '2px solid #DFE1E6',
                  borderRadius: 3,
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                  cursor: isSubmitting ? 'not-allowed' : 'text',
                }}
                onFocus={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.borderColor = '#0052CC';
                  }
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#DFE1E6';
                }}
              />
            </div>

            {/* Sprint Goal */}
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="sprint-goal"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#172B4D',
                  marginBottom: 6,
                }}
              >
                <Target size={14} />
                Sprint Goal
              </label>
              <textarea
                id="sprint-goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="What do you want to accomplish in this sprint?"
                disabled={isSubmitting}
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 14,
                  color: '#172B4D',
                  backgroundColor: isSubmitting ? '#F4F5F7' : '#FFFFFF',
                  border: '2px solid #DFE1E6',
                  borderRadius: 3,
                  outline: 'none',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  transition: 'all 0.15s',
                  cursor: isSubmitting ? 'not-allowed' : 'text',
                }}
                onFocus={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.borderColor = '#0052CC';
                  }
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#DFE1E6';
                }}
              />
            </div>

            {/* Date Range */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {/* Start Date */}
              <div>
                <label
                  htmlFor="start-date"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#172B4D',
                    marginBottom: 6,
                  }}
                >
                  <Calendar size={14} />
                  Start Date
                </label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 14,
                    color: '#172B4D',
                    backgroundColor: isSubmitting ? '#F4F5F7' : '#FFFFFF',
                    border: '2px solid #DFE1E6',
                    borderRadius: 3,
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                    cursor: isSubmitting ? 'not-allowed' : 'text',
                  }}
                  onFocus={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.borderColor = '#0052CC';
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#DFE1E6';
                  }}
                />
              </div>

              {/* End Date */}
              <div>
                <label
                  htmlFor="end-date"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#172B4D',
                    marginBottom: 6,
                  }}
                >
                  <Calendar size={14} />
                  End Date
                </label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate || undefined}
                  disabled={isSubmitting}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 14,
                    color: '#172B4D',
                    backgroundColor: isSubmitting ? '#F4F5F7' : '#FFFFFF',
                    border: '2px solid #DFE1E6',
                    borderRadius: 3,
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                    cursor: isSubmitting ? 'not-allowed' : 'text',
                  }}
                  onFocus={(e) => {
                    if (!isSubmitting) {
                      e.currentTarget.style.borderColor = '#0052CC';
                    }
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#DFE1E6';
                  }}
                />
              </div>
            </div>

            {/* Help Text */}
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: '#DEEBFF',
                borderLeft: '3px solid #0052CC',
                borderRadius: 3,
                fontSize: 13,
                color: '#172B4D',
                lineHeight: 1.5,
              }}
            >
              <strong>Tip:</strong> After creating the sprint, you can drag issues from the backlog to add them to this sprint.
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
              padding: '16px 24px',
              borderTop: '1px solid #DFE1E6',
              backgroundColor: '#FAFBFC',
            }}
          >
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
              disabled={!name.trim()}
              loading={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Sprint'}
            </ButtonCore>
          </div>
        </form>
      </div>
    </>
  );
}
