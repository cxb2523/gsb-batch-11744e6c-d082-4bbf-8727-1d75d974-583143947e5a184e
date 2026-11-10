'use client';

import React, { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api/client';
import { Mail, Shield, Building2, Calendar, Clock, Save, Pencil, X } from 'lucide-react';

const C = {
  pageBg: '#F4F5F7',
  cardBg: '#FFFFFF',
  border: '#DFE1E6',
  borderSubtle: '#EBECF0',
  heading: '#172B4D',
  body: '#42526E',
  subtle: '#5E6C84',
  muted: '#6B778C',
  link: '#0052CC',
  linkHover: '#0747A6',
  inputBg: '#FAFBFC',
  inputFocusBorder: '#4C9AFF',
  inputFocusHalo: '#DEEBFF',
  success: '#00875A',
  successBg: '#E3FCEF',
  danger: '#DE350B',
};

interface UserProfile {
  id: number;
  email: string;
  name: string;
  role: string;
  department?: string | null;
  designation?: string | null;
  profile_photo?: string | null;
  last_login_at?: string | null;
  created_at?: string | null;
}

interface SummaryCounts {
  overdue: number;
  due_today: number;
  blocked: number;
  in_progress: number;
  at_risk: number;
  urgent_open: number;
}

function initials(name?: string): string {
  if (!name) return '??';
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || name.slice(0, 2).toUpperCase());
}

function formatLong(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function relative(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return formatLong(iso);
}

async function patchMe(body: Partial<UserProfile>): Promise<UserProfile> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/auth/me`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH /auth/me failed: ${res.status}`);
  return res.json();
}

export default function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<SummaryCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ name: string; department: string; designation: string }>({
    name: '',
    department: '',
    designation: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiGet<UserProfile>('/auth/me');
        if (cancelled) return;
        setUser(me);
        setForm({ name: me.name ?? '', department: me.department ?? '', designation: me.designation ?? '' });
        try {
          const s = await apiGet<{ counts: SummaryCounts }>('/dashboard/summary');
          if (!cancelled) setSummary(s.counts);
        } catch {
          /* dashboard summary optional */
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const updated = await patchMe({
        name: form.name.trim() || user.name,
        department: form.department.trim() || null,
        designation: form.designation.trim() || null,
      });
      setUser(updated);
      setEditing(false);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, background: C.pageBg, minHeight: '100vh', color: C.muted, fontSize: 13 }}>
        Loading profile…
      </div>
    );
  }
  if (!user) {
    return (
      <div style={{ padding: 24, background: C.pageBg, minHeight: '100vh', color: C.danger, fontSize: 13 }}>
        Could not load your profile.
      </div>
    );
  }

  return (
    <div style={{ background: C.pageBg, minHeight: '100vh' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px 64px' }}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: C.heading }}>Profile</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: C.subtle }}>
            Your account information and activity.
          </p>
        </div>

        {/* Profile card */}
        <section
          style={{
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: 3,
            padding: 24,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
            {user.profile_photo ? (
              <img
                src={user.profile_photo}
                alt={user.name}
                style={{ width: 88, height: 88, borderRadius: 3, objectFit: 'cover', border: `1px solid ${C.border}` }}
              />
            ) : (
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 3,
                  background: C.link,
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                }}
              >
                {initials(user.name)}
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              {editing ? (
                <EditForm
                  form={form}
                  setForm={setForm}
                  onSave={onSave}
                  onCancel={() => {
                    setEditing(false);
                    setForm({
                      name: user.name ?? '',
                      department: user.department ?? '',
                      designation: user.designation ?? '',
                    });
                    setSaveErr(null);
                  }}
                  saving={saving}
                  error={saveErr}
                />
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: C.heading }}>
                      {user.name}
                    </h2>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                        padding: '2px 8px',
                        borderRadius: 3,
                        background: user.role === 'admin' ? '#EAE6FF' : '#DEEBFF',
                        color: user.role === 'admin' ? '#5243AA' : C.link,
                      }}
                    >
                      {user.role}
                    </span>
                  </div>
                  {user.designation && (
                    <div style={{ marginTop: 4, fontSize: 14, color: C.body }}>{user.designation}</div>
                  )}
                  <Field icon={<Mail size={14} />} label="Email" value={user.email} />
                  <Field icon={<Building2 size={14} />} label="Department" value={user.department || '—'} />
                  <Field icon={<Calendar size={14} />} label="Member since" value={formatLong(user.created_at)} />
                  <Field icon={<Clock size={14} />} label="Last login" value={relative(user.last_login_at)} />

                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    style={{
                      marginTop: 16,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      background: 'transparent',
                      border: `1px solid ${C.border}`,
                      borderRadius: 3,
                      fontSize: 13,
                      color: C.body,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = C.pageBg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Pencil size={13} /> Edit profile
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Workload summary */}
        {summary && (
          <section
            style={{
              background: C.cardBg,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              padding: 20,
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: C.heading }}>
              My workload
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              <Stat label="Overdue" value={summary.overdue} accent={C.danger} />
              <Stat label="Due today" value={summary.due_today} accent="#FF991F" />
              <Stat label="Blocked" value={summary.blocked} accent={C.danger} />
              <Stat label="Urgent" value={summary.urgent_open} accent={C.danger} />
              <Stat label="In progress" value={summary.in_progress} accent={C.link} />
              <Stat label="At risk" value={summary.at_risk} accent="#FF991F" />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
      <span style={{ color: C.muted, display: 'inline-flex' }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 110 }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: C.body }}>{value}</span>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        border: `1px solid ${C.borderSubtle}`,
        borderRadius: 3,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 600, color: value > 0 ? accent : C.muted }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function EditForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  error,
}: {
  form: { name: string; department: string; designation: string };
  setForm: (f: { name: string; department: string; designation: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: C.inputBg,
    border: `1px solid ${C.border}`,
    borderRadius: 3,
    padding: '8px 12px',
    fontSize: 14,
    color: C.heading,
    outline: 'none',
    fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Designation</label>
          <input
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
            placeholder="e.g. Senior Engineer"
            style={inputStyle}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Department</label>
          <input
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            placeholder="e.g. Engineering"
            style={inputStyle}
          />
        </div>
      </div>
      {error && (
        <div style={{ marginTop: 10, fontSize: 13, color: C.danger }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            background: C.link,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 3,
            fontSize: 13,
            fontWeight: 500,
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
          onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = C.linkHover; }}
          onMouseLeave={(e) => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = C.link; }}
        >
          <Save size={13} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            background: 'transparent',
            border: `1px solid ${C.border}`,
            borderRadius: 3,
            fontSize: 13,
            color: C.body,
            cursor: 'pointer',
          }}
        >
          <X size={13} /> Cancel
        </button>
      </div>
    </div>
  );
}
