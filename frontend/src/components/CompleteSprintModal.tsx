'use client';

import React, { useEffect, useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { ButtonCore } from '@/components/ui';
import { Sprint } from '../lib/api/sprints';

interface CompleteSprintModalProps {
  isOpen: boolean;
  onClose: () => void;
  sprintName: string;
  /** Sprints (future/parked) that incomplete issues can be moved into */
  targetSprints: Sprint[];
  /** Number of incomplete issues in the sprint, if known */
  incompleteCount?: number;
  /** Called with the chosen destination: a sprint id, or null for backlog */
  onConfirm: (moveToSprintId: number | null) => Promise<void> | void;
}

export default function CompleteSprintModal({
  isOpen,
  onClose,
  sprintName,
  targetSprints,
  incompleteCount,
  onConfirm,
}: CompleteSprintModalProps) {
  const [destination, setDestination] = useState<'backlog' | 'sprint'>('backlog');
  const [targetSprintId, setTargetSprintId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDestination('backlog');
      setTargetSprintId(targetSprints.length > 0 ? targetSprints[0].id : null);
      setError(null);
    }
  }, [isOpen, targetSprints]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (destination === 'sprint' && !targetSprintId) {
      setError('Please select a sprint to move incomplete issues to');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm(destination === 'sprint' ? targetSprintId : null);
      onClose();
    } catch (err) {
      console.error('Failed to complete sprint:', err);
      setError('Failed to complete sprint. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const radioOptionStyle = (selected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '12px 16px',
    border: `2px solid ${selected ? '#0052CC' : '#DFE1E6'}`,
    borderRadius: 3,
    cursor: isSubmitting ? 'not-allowed' : 'pointer',
    backgroundColor: selected ? '#DEEBFF' : '#FFFFFF',
    transition: 'all 0.15s',
    marginBottom: 10,
  });

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
          maxWidth: 520,
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
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <CheckCircle2 size={20} color="#36B37E" />
            Complete Sprint
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

        {/* Body */}
        <div style={{ padding: 24 }}>
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

          <div style={{ fontSize: 14, color: '#172B4D', marginBottom: 16, lineHeight: 1.5 }}>
            You are about to complete <strong>{sprintName}</strong>.
            {typeof incompleteCount === 'number' && (
              <>
                {' '}
                {incompleteCount === 0 ? (
                  <span>All issues are done — nothing needs to be moved.</span>
                ) : (
                  <span>
                    It has <strong>{incompleteCount}</strong> incomplete issue{incompleteCount === 1 ? '' : 's'}.
                  </span>
                )}
              </>
            )}
          </div>

          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#172B4D',
              marginBottom: 8,
            }}
          >
            Move incomplete issues to:
          </div>

          {/* Backlog option */}
          <label
            style={radioOptionStyle(destination === 'backlog')}
            onClick={() => !isSubmitting && setDestination('backlog')}
          >
            <input
              type="radio"
              name="complete-sprint-destination"
              checked={destination === 'backlog'}
              onChange={() => setDestination('backlog')}
              disabled={isSubmitting}
              style={{ marginTop: 2, accentColor: '#0052CC' }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#172B4D' }}>Backlog</div>
              <div style={{ fontSize: 12, color: '#5E6C84', marginTop: 2 }}>
                Issues are removed from the sprint and returned to the backlog
              </div>
            </div>
          </label>

          {/* Next sprint option */}
          <label
            style={{
              ...radioOptionStyle(destination === 'sprint'),
              opacity: targetSprints.length === 0 ? 0.5 : 1,
              cursor: targetSprints.length === 0 || isSubmitting ? 'not-allowed' : 'pointer',
            }}
            onClick={() => {
              if (!isSubmitting && targetSprints.length > 0) {
                setDestination('sprint');
              }
            }}
          >
            <input
              type="radio"
              name="complete-sprint-destination"
              checked={destination === 'sprint'}
              onChange={() => setDestination('sprint')}
              disabled={isSubmitting || targetSprints.length === 0}
              style={{ marginTop: 2, accentColor: '#0052CC' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#172B4D' }}>Another sprint</div>
              <div style={{ fontSize: 12, color: '#5E6C84', marginTop: 2 }}>
                {targetSprints.length === 0
                  ? 'No parked sprints available — create one first'
                  : 'Issues are carried over to the selected sprint'}
              </div>
              {destination === 'sprint' && targetSprints.length > 0 && (
                <select
                  value={targetSprintId ?? ''}
                  onChange={(e) => setTargetSprintId(Number(e.target.value))}
                  disabled={isSubmitting}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    marginTop: 10,
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: 14,
                    color: '#172B4D',
                    backgroundColor: '#FFFFFF',
                    border: '2px solid #DFE1E6',
                    borderRadius: 3,
                    outline: 'none',
                    fontFamily: 'inherit',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {targetSprints.map((sprint) => (
                    <option key={sprint.id} value={sprint.id}>
                      {sprint.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </label>
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
          <ButtonCore variant="secondary" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </ButtonCore>
          <ButtonCore variant="primary" onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Completing...' : 'Complete Sprint'}
          </ButtonCore>
        </div>
      </div>
    </>
  );
}
