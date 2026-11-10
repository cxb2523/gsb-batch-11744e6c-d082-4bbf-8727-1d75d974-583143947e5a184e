'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { tokens } from '@/design-system/tokens';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Optional single action, e.g. "Undo". */
  action?: { label: string; run: () => void };
}

interface ToastContextValue {
  toast: (message: string, opts?: { kind?: ToastKind; action?: Toast['action'] }) => void;
  success: (message: string, action?: Toast['action']) => void;
  error: (message: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

/**
 * Confirmation that an action landed. Without this, archiving or assigning an issue looks
 * identical to nothing happening - the app previously only ever spoke up via window.alert,
 * and only on failure.
 */
export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // A no-op keeps a component usable outside the provider rather than crashing it.
    return {
      toast: () => {},
      success: () => {},
      error: () => {},
    };
  }
  return ctx;
}

const STYLES: Record<ToastKind, { bg: string; fg: string; icon: React.ReactNode }> = {
  success: { bg: '#E3FCEF', fg: '#006644', icon: <CheckCircle2 size={16} /> },
  error: { bg: '#FFEBE6', fg: '#BF2600', icon: <AlertCircle size={16} /> },
  info: { bg: '#DEEBFF', fg: '#0747A6', icon: <Info size={16} /> },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [mounted, setMounted] = React.useState(false);
  const nextId = React.useRef(1);

  React.useEffect(() => setMounted(true), []);

  const dismiss = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback<ToastContextValue['toast']>(
    (message, opts) => {
      const id = nextId.current++;
      const kind = opts?.kind ?? 'info';
      setToasts((prev) => [...prev, { id, kind, message, action: opts?.action }]);
      // Errors and anything with an action stay longer - they need to be read/acted on.
      const ttl = kind === 'error' || opts?.action ? 7000 : 3500;
      window.setTimeout(() => dismiss(id), ttl);
    },
    [dismiss]
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message, action) => toast(message, { kind: 'success', action }),
      error: (message) => toast(message, { kind: 'error' }),
    }),
    [toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              bottom: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              zIndex: 100030, // above modals and the confirm dialog
              pointerEvents: 'none',
            }}
          >
            {toasts.map((t) => {
              const s = STYLES[t.kind];
              return (
                <div
                  key={t.id}
                  style={{
                    pointerEvents: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    minWidth: 280,
                    maxWidth: 460,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: s.bg,
                    color: s.fg,
                    border: `1px solid ${s.fg}22`,
                    boxShadow: '0 8px 24px rgba(9,30,66,0.2)',
                    fontFamily: tokens.fontFamily.sans,
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {s.icon}
                  <span style={{ flex: 1, minWidth: 0 }}>{t.message}</span>

                  {t.action && (
                    <button
                      onClick={() => {
                        t.action?.run();
                        dismiss(t.id);
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: s.fg,
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: '0 4px',
                        flexShrink: 0,
                      }}
                    >
                      {t.action.label}
                    </button>
                  )}

                  <button
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: s.fg,
                      cursor: 'pointer',
                      display: 'flex',
                      padding: 2,
                      flexShrink: 0,
                      lineHeight: 0,
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
};

export default ToastProvider;
