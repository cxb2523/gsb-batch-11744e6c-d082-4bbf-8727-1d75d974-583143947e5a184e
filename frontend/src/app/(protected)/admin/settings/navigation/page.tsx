'use client';

import React, { useEffect, useState } from 'react';
import { Card, Switch } from '../../../../../design-system/components';
import { ButtonCore } from '@/components/ui';
import { tokens } from '../../../../../design-system/tokens';
import { organizationAPI } from '../../../../../lib/api/organization';
import { NAV_CATALOG, NAV_SECTION_LABELS, NavSection } from '../../../../../lib/navigation';
import { useNavigationConfig } from '../../../../../hooks/useNavigationConfig';

const SECTION_ORDER: NavSection[] = ['planning', 'development', 'operations', 'project'];

export default function NavigationSettings() {
  // Publishing the saved map updates this admin's own sidebar immediately. Other
  // users pick it up on their next page load.
  const { publish } = useNavigationConfig();
  const [config, setConfig] = useState<Record<string, boolean>>({});
  // What the server last gave us, to compare the form against.
  const [savedConfig, setSavedConfig] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    organizationAPI
      .getNavigation()
      .then((data) => {
        setConfig(data.navigation);
        setSavedConfig(data.navigation);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load navigation settings'))
      .finally(() => setLoading(false));
  }, []);

  // Absent means visible, so an item nobody has ever touched reads as on.
  const isOn = (id: string) => config[id] !== false;

  /**
   * The catalogue resolved against a stored map: every id, in catalogue order, with
   * absent read as visible and always-visible items forced on.
   *
   * Comparing these rather than the raw maps is what makes "unchanged" mean what the
   * admin sees. A stored map is often partial — it only holds ids someone has saved
   * before — so two maps that differ by a missing key can still describe the same
   * set of switches.
   */
  const resolve = (map: Record<string, boolean>): Record<string, boolean> => {
    const out: Record<string, boolean> = {};
    NAV_CATALOG.forEach((item) => {
      out[item.id] = item.alwaysVisible ? true : map[item.id] !== false;
    });
    return out;
  };

  const dirty = JSON.stringify(resolve(config)) !== JSON.stringify(resolve(savedConfig));

  const toggle = (id: string) => {
    setSaved(false);
    setConfig((prev) => ({ ...prev, [id]: !(prev[id] !== false) }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Send the whole catalogue, not just what was touched, so the stored map is a
      // complete picture rather than an accumulation of past edits.
      const data = await organizationAPI.updateNavigation(resolve(config));
      setConfig(data.navigation);
      setSavedConfig(data.navigation);
      publish(data.navigation);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save navigation settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ fontFamily: tokens.fontFamily.sans, fontSize: 14 }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: tokens.fontFamily.sans }}>
      <p style={{ margin: 0, fontSize: 14, color: tokens.colors.semantic.text.secondary, maxWidth: 640 }}>
        Choose which items appear in the project sidebar. This applies to every project
        for everyone. Hiding an item removes it from the sidebar only — the page behind
        it stays reachable by URL and keeps its own permission rules.
      </p>

      {error && (
        <div style={{ fontSize: 14, color: tokens.colors.error[400] }}>{error}</div>
      )}

      {SECTION_ORDER.map((section) => {
        const items = NAV_CATALOG.filter((i) => i.section === section);
        if (items.length === 0) return null;
        return (
          <Card key={section}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  color: tokens.colors.semantic.text.secondary,
                  marginBottom: 8,
                }}
              >
                {NAV_SECTION_LABELS[section]}
              </div>

              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      paddingBlock: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon size={18} color={tokens.colors.semantic.text.secondary} />
                      <span style={{ fontSize: 14, color: tokens.colors.neutral[900] }}>{item.label}</span>
                      {item.alwaysVisible && (
                        <span style={{ fontSize: 12, color: tokens.colors.semantic.text.secondary }}>
                          always shown — it is the way back here
                        </span>
                      )}
                    </div>
                    <Switch
                      checked={isOn(item.id)}
                      disabled={item.alwaysVisible}
                      onChange={() => toggle(item.id)}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
        {saved && (
          <span style={{ fontSize: 14, color: tokens.colors.semantic.text.secondary }}>
            Saved. Other users see this after their next page load.
          </span>
        )}
        <ButtonCore variant="primary" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving...' : 'Save changes'}
        </ButtonCore>
      </div>
    </div>
  );
}
