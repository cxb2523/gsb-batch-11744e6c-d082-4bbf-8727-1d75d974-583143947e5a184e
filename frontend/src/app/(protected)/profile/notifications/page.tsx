'use client';

import React, { useState, useEffect } from 'react';
import { Switch } from '../../../../design-system/components';
import { notificationsAPI, NotificationPreferences } from '../../../../lib/api/settings';

// Same palette the profile page uses, so the two screens read as one app.
const C = {
  pageBg: '#F4F5F7',
  cardBg: '#FFFFFF',
  border: '#DFE1E6',
  borderSubtle: '#EBECF0',
  heading: '#172B4D',
  body: '#42526E',
  subtle: '#5E6C84',
  muted: '#6B778C',
  rowHover: '#FAFBFC',
  danger: '#DE350B',
  dangerBg: '#FFEBE6',
  dangerBorder: '#FFBDAD',
};

interface NotificationSetting {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  field: keyof Omit<NotificationPreferences, 'user_id' | 'updated_at'>;
}

export default function NotificationsSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    {
      id: 'issue_assignments',
      title: 'Issue Assignments',
      description: 'Get notified when you are assigned to an issue',
      enabled: true,
      field: 'issue_assignments'
    },
    {
      id: 'mentions',
      title: 'Mentions',
      description: 'Get notified when someone mentions you in a comment',
      enabled: true,
      field: 'mentions'
    },
    {
      id: 'status_changes',
      title: 'Status Changes',
      description: 'Get notified when issue status changes',
      enabled: false,
      field: 'status_changes'
    },
    {
      id: 'comments',
      title: 'Comments',
      description: 'Get notified about new comments on issues you follow',
      enabled: true,
      field: 'comments'
    },
    {
      id: 'email_notifications',
      title: 'Email Notifications',
      description: 'Receive notifications via email',
      enabled: false,
      field: 'email_notifications'
    }
  ]);

  // Load notification preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      setError(null);
      const prefs = await notificationsAPI.getPreferences();

      // Update the notifications state with backend data
      setNotifications(prev => prev.map(notification => ({
        ...notification,
        enabled: prefs[notification.field]
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notification preferences');
      console.error('Error loading notification preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string, checked: boolean) => {
    // Find the notification setting
    const notification = notifications.find(n => n.id === id);
    if (!notification) return;

    // Optimistically update UI
    setNotifications(prev => prev.map(n =>
      n.id === id ? { ...n, enabled: checked } : n
    ));

    try {
      setSaving(true);
      setError(null);

      // Prepare update data - only send the field that changed
      const updateData = {
        [notification.field]: checked
      };

      await notificationsAPI.updatePreferences(updateData);
    } catch (err) {
      // Revert on error
      setNotifications(prev => prev.map(n =>
        n.id === id ? { ...n, enabled: !checked } : n
      ));
      setError(err instanceof Error ? err.message : 'Failed to update notification preference');
      console.error('Error updating notification preference:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 24, background: C.pageBg, minHeight: '100vh', color: C.muted, fontSize: 13 }}>
        Loading notification preferences…
      </div>
    );
  }

  return (
    <div style={{ background: C.pageBg, minHeight: '100vh' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 24px 64px' }}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: C.heading }}>Notifications</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: C.subtle }}>
            Choose what you want to be told about.
          </p>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 12px',
              borderRadius: 3,
              background: C.dangerBg,
              border: `1px solid ${C.dangerBorder}`,
              color: C.danger,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Preferences */}
        <section
          style={{
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          {notifications.map((notification, index) => (
            <div
              key={notification.id}
              onMouseEnter={() => setHovered(notification.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 24,
                padding: '14px 20px',
                borderTop: index === 0 ? 'none' : `1px solid ${C.borderSubtle}`,
                background: hovered === notification.id ? C.rowHover : C.cardBg,
                transition: 'background 120ms',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.heading }}>
                  {notification.title}
                </div>
                <div style={{ marginTop: 2, fontSize: 13, color: C.subtle }}>
                  {notification.description}
                </div>
              </div>

              <Switch
                checked={notification.enabled}
                onChange={(checked) => handleToggle(notification.id, checked)}
                disabled={saving}
              />
            </div>
          ))}
        </section>

        <p style={{ margin: '10px 2px 0', fontSize: 12, color: C.muted }}>
          Changes are saved automatically.
        </p>
      </div>
    </div>
  );
}
