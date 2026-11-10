'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { tokens } from '@/design-system/tokens';
import { ButtonCore } from './button-core';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  /** Main message. Pass nodes for richer content (e.g. an impact list). */
  children: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Styles the confirm button as destructive and blocks dismissal while busy. */
  destructive?: boolean;
  busy?: boolean;
  confirmIcon?: React.ReactNode;
  width?: number;
}

/**
 * Modal confirmation. Use instead of window.confirm for anything destructive, so the
 * dialog can spell out what is about to happen.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = false,
  busy = false,
  confirmIcon,
  width = 440,
}) => {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!isOpen || !mounted) return null;

  // Portal to <body> at a z-index above every modal in the app. Rendered inline it would
  // land *inside* whichever modal opened it (TicketDetailModal sits at z-index 9999), so
  // the dialog would open behind the overlay and clicking Delete would appear to do
  // nothing at all.
  return createPortal(
    <div
      onClick={() => !busy && onCancel()}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100020,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: 8,
          padding: 24,
          width,
          maxWidth: '90vw',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          fontFamily: tokens.fontFamily.sans,
        }}
      >
        <h3
          style={{
            margin: '0 0 12px',
            fontSize: 16,
            fontWeight: 600,
            color: tokens.colors.neutral[900],
          }}
        >
          {title}
        </h3>

        <div style={{ fontSize: 14, color: tokens.colors.neutral[700], lineHeight: 1.5 }}>
          {children}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <ButtonCore variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </ButtonCore>
          <ButtonCore
            variant={destructive ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            loading={busy}
            leftIcon={confirmIcon}
          >
            {confirmLabel}
          </ButtonCore>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialog;
