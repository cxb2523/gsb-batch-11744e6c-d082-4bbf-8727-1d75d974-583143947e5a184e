'use client';

import React, { useState } from 'react';
import { X, ChevronDown, Eye, EyeOff, Check, Circle } from 'lucide-react';
import { createUser } from '../lib/api/admin';
import { tokens } from '../design-system/tokens';
import { useToast, ButtonCore } from './ui';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const DEPARTMENTS = ['Engineering', 'Design', 'QA', 'DevOps', 'Management', 'Product'];

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid rgba(0,0,0,0.1)',
  borderRadius: 6,
  fontSize: 14,
  lineHeight: 1.5,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  transition: 'all 150ms ease',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  // Hide native arrow; we render our own ChevronDown
  appearance: 'none',
  paddingRight: 36,
  cursor: 'pointer',
};

const Req = () => <span style={{ color: '#DC2626' }}> *</span>;

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: '1 uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: '1 number', test: (p: string) => /[0-9]/.test(p) },
  { label: '1 special character', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function isPasswordValid(p: string) {
  return PASSWORD_RULES.every((r) => r.test(p));
}

export default function CreateUserModal({ isOpen, onClose, onCreated }: Props) {
  const toast = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    setName(''); setEmail(''); setPassword(''); setPasswordTouched(false);
    setShowPassword(false); setRole('user'); setDepartment(''); setDesignation(''); setError('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow letters and spaces
    const val = e.target.value.replace(/[^A-Za-z\s]/g, '');
    setName(val);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError('');

    if (!name.trim()) { setError('Name is required.'); return; }
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!isPasswordValid(password)) {
      setError('Password does not meet the requirements below.');
      return;
    }

    setSaving(true);
    try {
      await createUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        department: department || null,
        designation: designation.trim() || null,
      });
      onCreated();
      toast.success(`User ${name.trim()} created successfully`);
      close();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : 'Could not create the user. Try again.');
    }
  };

  const pwdValid = isPasswordValid(password);
  const canSubmit = Boolean(name.trim() && email.trim() && pwdValid) && !saving;

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 9998 }}
        onClick={close}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: '#ffffff',
          borderRadius: 12,
          padding: 24,
          width: '90%',
          maxWidth: 440,
          maxHeight: '90vh',
          overflowY: 'auto',
          zIndex: 9999,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          fontFamily: tokens.fontFamily.sans,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Create User</h3>
          <button
            type="button"
            onClick={close}
            style={{
              background: 'transparent', border: 'none', borderRadius: 6,
              padding: 6, cursor: 'pointer', color: '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit}>
          {/* Name */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Name<Req /></label>
            <input
              style={inputStyle}
              value={name}
              onChange={handleNameChange}
              placeholder="Full name"
              autoComplete="off"
              onFocus={(e) => { e.currentTarget.style.borderColor = tokens.colors.primary[500]; e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[500]}20`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email<Req /></label>
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              onFocus={(e) => { e.currentTarget.style.borderColor = tokens.colors.primary[500]; e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[500]}20`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Temporary password<Req /></label>
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...inputStyle, paddingRight: 40 }}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordTouched(true); }}
                placeholder="Create a temporary password"
                autoComplete="new-password"
                onFocus={(e) => { e.currentTarget.style.borderColor = tokens.colors.primary[500]; e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[500]}20`; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', padding: 2, cursor: 'pointer',
                  color: '#6b7280', display: 'flex', alignItems: 'center',
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
              {PASSWORD_RULES.map((rule) => {
                const met = passwordTouched && rule.test(password);
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

          {/* Role */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Role<Req /></label>
            <div style={{ position: 'relative' }}>
              <select
                style={selectStyle}
                value={role}
                onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
                onFocus={(e) => { e.currentTarget.style.borderColor = tokens.colors.primary[500]; e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[500]}20`; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Department */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Department <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(0,0,0,0.4)' }}>(Optional)</span></label>
            <div style={{ position: 'relative' }}>
              <select
                style={selectStyle}
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                onFocus={(e) => { e.currentTarget.style.borderColor = tokens.colors.primary[500]; e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[500]}20`; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <option value="">Select department</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Designation */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Designation <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(0,0,0,0.4)' }}>(Optional)</span></label>
            <input
              style={inputStyle}
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Senior Developer"
              onFocus={(e) => { e.currentTarget.style.borderColor = tokens.colors.primary[500]; e.currentTarget.style.boxShadow = `0 0 0 3px ${tokens.colors.primary[500]}20`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          {error && (
            <div style={{ color: tokens.colors.error[700], fontSize: 13, marginBottom: 16, padding: '8px 10px', background: tokens.colors.error[50], borderRadius: 6 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <ButtonCore variant="secondary" onClick={close}>
              Cancel
            </ButtonCore>
            <ButtonCore type="submit" variant="primary" disabled={!canSubmit}>
              {saving ? 'Creating…' : 'Create User'}
            </ButtonCore>
          </div>
        </form>
      </div>
    </>
  );
}
