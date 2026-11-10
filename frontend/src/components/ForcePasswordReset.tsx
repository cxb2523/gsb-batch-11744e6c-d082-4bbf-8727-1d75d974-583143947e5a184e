'use client';

import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Check, Circle } from 'lucide-react';
import { changePassword } from '../lib/api/auth';

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: '1 uppercase letter',    test: (p: string) => /[A-Z]/.test(p) },
  { label: '1 number',              test: (p: string) => /[0-9]/.test(p) },
  { label: '1 special character',   test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function isPasswordValid(p: string) {
  return PASSWORD_RULES.every((r) => r.test(p));
}

const FOCUS_COLOR = '#155DFC';

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ position: 'relative', marginTop: 6 }}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          width: '100%',
          padding: '10px 40px 10px 12px',
          borderRadius: 8,
          border: `1px solid ${focused ? FOCUS_COLOR : '#D1D5DB'}`,
          boxShadow: focused ? `0 0 0 3px ${FOCUS_COLOR}20` : 'none',
          fontSize: 14,
          lineHeight: 1.5,
          outline: 'none',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'transparent', border: 'none', padding: 2,
          cursor: 'pointer', color: '#6B7280', display: 'flex', alignItems: 'center',
        }}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

/**
 * Full-screen, blocking first-login password change. Shown by the protected layout when
 * /auth/me reports must_change_password (an admin-created account still on its temporary
 * password). The user cannot reach the app until they set their own password.
 */
export default function ForcePasswordReset({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [nextTouched, setNextTouched] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    if (!isPasswordValid(next)) {
      setError('Your new password does not meet all the requirements below.');
      return;
    }
    if (next !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    if (next === current) {
      setError('Choose a password different from the temporary one.');
      return;
    }
    setLoading(true);
    const result = await changePassword(current, next);
    if (result.status === 'ok') {
      onDone();
      return;
    }
    setLoading(false);
    if (result.status === 'invalid') {
      setError(result.message || 'Your current password is incorrect.');
    } else if (result.status === 'offline') {
      setError("Can't reach the server. Check your connection and try again.");
    } else {
      setError('Something went wrong. Please try again.');
    }
  };

  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151', display: 'block' };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F4F5F7',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#FFFFFF',
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
          padding: 32,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: '#FEF3C7',
            margin: '0 auto 16px',
          }}
        >
          <Lock size={22} color="#B45309" />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', color: '#111827', margin: 0 }}>
          Set your own password
        </h1>
        <p style={{ fontSize: 14, color: '#4B5563', textAlign: 'center', margin: '10px 0 22px', lineHeight: 1.5 }}>
          Your current password was set by an administrator. For your security, choose your own
          password now — you'll use it to sign in from here on.
        </p>

        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Current (temporary) password</label>
            <PasswordInput
              value={current}
              onChange={setCurrent}
              placeholder="The password your admin gave you"
              autoComplete="current-password"
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>New password</label>
            <PasswordInput
              value={next}
              onChange={(v) => { setNext(v); setNextTouched(true); }}
              placeholder="Create your new password"
              autoComplete="new-password"
            />
            {/* Rule indicators — always visible, green once met */}
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
              {PASSWORD_RULES.map((rule) => {
                const met = nextTouched && rule.test(next);
                return (
                  <span
                    key={rule.label}
                    style={{
                      fontSize: 11,
                      color: met ? '#10B981' : 'rgba(0,0,0,0.35)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      transition: 'color 0.15s',
                    }}
                  >
                    {met ? <Check size={11} /> : <Circle size={11} />}
                    {rule.label}
                  </span>
                );
              })}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Confirm new password</label>
            <PasswordInput
              value={confirm}
              onChange={setConfirm}
              placeholder="Re-enter your new password"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div style={{
              color: '#B91C1C', fontSize: 13, marginTop: 14,
              padding: '8px 10px', background: '#FEF2F2', borderRadius: 6,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              marginTop: 22,
              padding: '11px 16px',
              borderRadius: 8,
              border: 'none',
              background: loading ? '#93C5FD' : '#155DFC',
              color: '#FFFFFF',
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Saving…' : 'Set password and continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
