'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Calendar } from 'lucide-react';
import { ButtonCore } from '@/components/ui';

interface EditEndDateSprint {
  id: number;
  name: string;
  start_date?: string;
  end_date?: string;
}

interface EditSprintEndDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  sprint: EditEndDateSprint | null;
  /** Performs the save; should throw on failure so the error shows. */
  onConfirm: (endDate: string) => Promise<void>;
}

/** Format a Date as a local YYYY-MM-DD string for <input type="date">. */
function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toInputDate(d);
}

// Admin-only dialog to extend or fix a sprint's end date. The start date is not
// editable (it is locked at activation); the new end date must be in the future
// and after the start date — mirrored by the backend guardrails.
export default function EditSprintEndDateModal({
  isOpen,
  onClose,
  sprint,
  onConfirm,
}: EditSprintEndDateModalProps) {
  const today = useMemo(() => toInputDate(new Date()), []);
  const startDay = sprint?.start_date ? sprint.start_date.slice(0, 10) : undefined;
  // The earliest valid end date: after both today and the start date.
  const minEnd = useMemo(() => {
    const floor = startDay && startDay > today ? startDay : today;
    return addDays(floor, 1);
  }, [startDay, today]);

  const [endDate, setEndDate] = useState(minEnd);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !sprint) return;
    const existing = sprint.end_date ? sprint.end_date.slice(0, 10) : '';
    setEndDate(existing && existing >= minEnd ? existing : minEnd);
    setError(null);
  }, [isOpen, sprint, minEnd]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endDate) {
      setError('An end date is required.');
      return;
    }
    if (endDate <= today) {
      setError('The end date must be in the future.');
      return;
    }
    if (startDay && endDate <= startDay) {
      setError('The end date must be after the start date.');
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm(endDate);
      onClose();
    } catch (err) {
      console.error('Failed to update sprint end date:', err);
      setError(err instanceof Error ? err.message : 'Failed to update the end date. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError(null);
      onClose();
    }
  };

  if (!isOpen || !sprint) return null;

  return (
    <>
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

      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: '#FFFFFF',
          borderRadius: 8,
          width: '90%',
          maxWidth: 460,
          zIndex: 9999,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid #DFE1E6',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#172B4D', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} />
            Edit end date
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
              borderRadius: 6,
              opacity: isSubmitting ? 0.5 : 1,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px' }}>
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

            <p style={{ margin: '0 0 20px', fontSize: 14, color: '#5E6C84' }}>
              Change the end date for <strong style={{ color: '#172B4D' }}>{sprint.name}</strong>.
              The start date stays fixed; the new end date must be in the future.
            </p>

            <label
              htmlFor="edit-sprint-end-date"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#172B4D', marginBottom: 6 }}
            >
              <Calendar size={14} />
              End Date <span style={{ color: '#DE350B' }}>*</span>
            </label>
            <input
              id="edit-sprint-end-date"
              type="date"
              value={endDate}
              min={minEnd}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={isSubmitting}
              required
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
                cursor: isSubmitting ? 'not-allowed' : 'text',
              }}
            />
          </div>

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
            <ButtonCore type="submit" variant="primary" disabled={isSubmitting || !endDate}>
              {isSubmitting ? 'Saving...' : 'Save end date'}
            </ButtonCore>
          </div>
        </form>
      </div>
    </>
  );
}
