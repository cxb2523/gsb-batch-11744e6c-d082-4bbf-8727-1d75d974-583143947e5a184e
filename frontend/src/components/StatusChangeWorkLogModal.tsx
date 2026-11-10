"use client";

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ButtonCore } from '@/components/ui';
import { tokens } from '@/design-system/tokens';

interface StatusChangeWorkLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (comment: string, mergeRequestUrl: string) => Promise<void>;
  ticketKey: string;
  fromStatus: string;
  toStatus: string;
  currentMergeRequestUrl?: string;
}

const StatusChangeWorkLogModal: React.FC<StatusChangeWorkLogModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  ticketKey,
  fromStatus,
  toStatus,
  currentMergeRequestUrl = '',
}) => {
  const [comment, setComment] = useState('');
  const [mergeRequestUrl, setMergeRequestUrl] = useState(currentMergeRequestUrl);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset merge request URL when modal opens with new data
  useEffect(() => {
    if (isOpen) {
      setMergeRequestUrl(currentMergeRequestUrl);
      setComment('');
    }
  }, [isOpen, currentMergeRequestUrl]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    try {
      await onSubmit(comment, mergeRequestUrl);
      onClose();
    } catch (error) {
      console.error('Failed to submit work log:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit('', mergeRequestUrl);
      onClose();
    } catch (error) {
      console.error('Failed to change status:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
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
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 8,
          maxWidth: 560,
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: tokens.shadows.lg,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 600,
              color: tokens.colors.neutral[900],
            }}
          >
            Status Change - {ticketKey}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              cursor: 'pointer',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = tokens.colors.neutral[100];
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X size={20} color={tokens.colors.neutral[600]} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '24px' }}>
            {/* Status change info */}
            <div
              style={{
                padding: 16,
                backgroundColor: tokens.colors.neutral[50],
                borderRadius: 6,
                marginBottom: 20,
                border: `1px solid ${tokens.colors.neutral[200]}`,
              }}
            >
              <div style={{ fontSize: 14, color: tokens.colors.neutral[700] }}>
                Moving from{' '}
                <span style={{ fontWeight: 600, color: tokens.colors.neutral[900] }}>
                  {fromStatus}
                </span>{' '}
                to{' '}
                <span style={{ fontWeight: 600, color: tokens.colors.neutral[900] }}>
                  {toStatus}
                </span>
              </div>
            </div>

            {/* Work log/comment field */}
            <div>
              <label
                style={{
                  display: 'block',
                  marginBottom: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: tokens.colors.neutral[900],
                }}
              >
                Add Work Log / Comment{' '}
                <span style={{ color: tokens.colors.neutral[500], fontWeight: 400 }}>
                  (optional)
                </span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Describe what work was done or why the status changed..."
                style={{
                  width: '100%',
                  minHeight: 120,
                  padding: 12,
                  fontSize: 14,
                  fontFamily: tokens.fontFamily.sans,
                  border: `1px solid ${tokens.colors.neutral[300]}`,
                  borderRadius: 6,
                  resize: 'vertical',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = tokens.colors.primary[500];
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[100]}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = tokens.colors.neutral[300];
                  e.currentTarget.style.boxShadow = 'none';
                }}
                autoFocus
              />
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: tokens.colors.neutral[600],
                }}
              >
                This will be added as a comment and logged in the ticket history.
              </div>
            </div>

            {/* Merge Request URL field */}
            <div style={{ marginTop: 20 }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: tokens.colors.neutral[900],
                }}
              >
                Merge Request / PR URL{' '}
                <span style={{ color: tokens.colors.neutral[500], fontWeight: 400 }}>
                  (optional)
                </span>
              </label>
              <input
                type="url"
                value={mergeRequestUrl}
                onChange={(e) => setMergeRequestUrl(e.target.value)}
                placeholder="https://github.com/org/repo/pull/123"
                style={{
                  width: '100%',
                  padding: 12,
                  fontSize: 14,
                  fontFamily: tokens.fontFamily.sans,
                  border: `1px solid ${tokens.colors.neutral[300]}`,
                  borderRadius: 6,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = tokens.colors.primary[500];
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[100]}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = tokens.colors.neutral[300];
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: tokens.colors.neutral[600],
                }}
              >
                Link to the pull request or merge request for this change.
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: `1px solid ${tokens.colors.neutral[200]}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
            }}
          >
            <ButtonCore variant="secondary" onClick={handleSkip} disabled={isSubmitting}>
              Skip
            </ButtonCore>
            <ButtonCore type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Change Status'}
            </ButtonCore>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StatusChangeWorkLogModal;
