'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, Calendar, Rocket } from 'lucide-react';
import { ButtonCore } from '@/components/ui';

interface StartSprintSprint {
  id: number;
  name: string;
  end_date?: string;
}

interface StartSprintModalProps {
  isOpen: boolean;
  onClose: () => void;
  sprint: StartSprintSprint | null;
  /** Performs the actual start call; should throw on failure so the error shows. */
  onConfirm: (dates: { end_date: string }) => Promise<void>;
}

// Duration presets offered when time-boxing a sprint at activation. "Custom"
// lets the user type an end date directly. The start date is always today — it
// is stamped by the server when the sprint goes live — so there is no start field.
const DURATION_WEEKS = [1, 2, 3, 4] as const;
const DEFAULT_DURATION_WEEKS = 2;

/** Format a Date as a local YYYY-MM-DD string for <input type="date">. */
function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Add whole days to a YYYY-MM-DD string, returning a YYYY-MM-DD string. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toInputDate(d);
}

/** Human-readable form of today's date, e.g. "Mon, Oct 23". */
function prettyToday(): string {
  return new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function StartSprintModal({
  isOpen,
  onClose,
  sprint,
  onConfirm,
}: StartSprintModalProps) {
  const today = useMemo(() => toInputDate(new Date()), []);
  const [endDate, setEndDate] = useState(addDays(today, DEFAULT_DURATION_WEEKS * 7));
  const [durationWeeks, setDurationWeeks] = useState<number | null>(DEFAULT_DURATION_WEEKS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form whenever a new sprint is opened. The sprint starts today, so
  // the end date defaults to today + 2 weeks (or any end date already planned).
  useEffect(() => {
    if (!isOpen || !sprint) return;
    if (sprint.end_date && sprint.end_date.slice(0, 10) > today) {
      setEndDate(sprint.end_date.slice(0, 10));
      setDurationWeeks(null);
    } else {
      setEndDate(addDays(today, DEFAULT_DURATION_WEEKS * 7));
      setDurationWeeks(DEFAULT_DURATION_WEEKS);
    }
    setError(null);
  }, [isOpen, sprint, today]);

  const applyDuration = (weeks: number) => {
    setDurationWeeks(weeks);
    setEndDate(addDays(today, weeks * 7));
  };

  const onEndDateChange = (value: string) => {
    setEndDate(value);
    setDurationWeeks(null); // manual edit => custom duration
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endDate) {
      setError('An end date is required to start a sprint.');
      return;
    }
    if (endDate <= today) {
      setError('The end date must be after today.');
      return;
    }
    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm({ end_date: endDate });
      onClose();
    } catch (err) {
      console.error('Failed to start sprint:', err);
      setError(err instanceof Error ? err.message : 'Failed to start sprint. Please try again.');
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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#172B4D', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Rocket size={18} />
            Start Sprint
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
              opacity: isSubmitting ? 0.5 : 1,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
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
              Starting <strong style={{ color: '#172B4D' }}>{sprint.name}</strong>. A sprint is
              time-boxed, so set when it ends.
            </p>

            {/* Start date: fixed to today, shown read-only */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                marginBottom: 20,
                backgroundColor: '#F4F5F7',
                borderRadius: 3,
                fontSize: 13,
                color: '#42526E',
              }}
            >
              <Calendar size={14} />
              Starts today — <strong style={{ color: '#172B4D' }}>{prettyToday()}</strong>
            </div>

            {/* Duration presets */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#172B4D', marginBottom: 6 }}>
                Duration
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {DURATION_WEEKS.map((weeks) => {
                  const selected = durationWeeks === weeks;
                  return (
                    <button
                      key={weeks}
                      type="button"
                      onClick={() => applyDuration(weeks)}
                      disabled={isSubmitting}
                      style={{
                        padding: '6px 14px',
                        fontSize: 13,
                        fontWeight: 500,
                        borderRadius: 3,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        border: `2px solid ${selected ? '#0052CC' : '#DFE1E6'}`,
                        backgroundColor: selected ? '#DEEBFF' : '#FFFFFF',
                        color: selected ? '#0747A6' : '#42526E',
                        fontFamily: 'inherit',
                      }}
                    >
                      {weeks} {weeks === 1 ? 'week' : 'weeks'}
                    </button>
                  );
                })}
                <span
                  style={{
                    padding: '6px 14px',
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 3,
                    border: `2px solid ${durationWeeks == null ? '#0052CC' : '#DFE1E6'}`,
                    backgroundColor: durationWeeks == null ? '#DEEBFF' : '#FFFFFF',
                    color: durationWeeks == null ? '#0747A6' : '#42526E',
                  }}
                >
                  Custom
                </span>
              </div>
            </div>

            {/* End date */}
            <div>
              <label
                htmlFor="start-sprint-end-date"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#172B4D', marginBottom: 6 }}
              >
                <Calendar size={14} />
                End Date <span style={{ color: '#DE350B' }}>*</span>
              </label>
              <input
                id="start-sprint-end-date"
                type="date"
                value={endDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                min={addDays(today, 1)}
                disabled={isSubmitting}
                required
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
              />
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
            <ButtonCore variant="secondary" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </ButtonCore>
            <ButtonCore type="submit" variant="primary" disabled={isSubmitting || !endDate}>
              {isSubmitting ? 'Starting...' : 'Start Sprint'}
            </ButtonCore>
          </div>
        </form>
      </div>
    </>
  );
}
