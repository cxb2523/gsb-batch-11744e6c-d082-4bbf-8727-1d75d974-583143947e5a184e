'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useProjectIdParam } from '../../../../../../hooks/useProjectContext';
import { tokens } from '../../../../../../design-system/tokens';
import {
  integrationsAPI,
  ProviderInfo,
  IntegrationStatus,
  IntegrationTarget,
} from '../../../../../../lib/api/integrations';

// Per-provider brand icon. Falls back to a neutral "link" glyph for any provider
// without an entry here — so a new backend provider renders with zero frontend work.
function ProviderIcon({ providerKey }: { providerKey: string }) {
  if (providerKey === 'slack') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.528 2.528 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A" />
        <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0" />
        <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D" />
        <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E" />
      </svg>
    );
  }
  // Generic "link" icon
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={tokens.colors.semantic.text.secondary} strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </svg>
  );
}

interface CardState {
  provider: ProviderInfo;
  status: IntegrationStatus | null;
  targets: IntegrationTarget[];
  loading: boolean;
  error: string | null;
  form: Record<string, string>;
}

export default function IntegrationsSettings() {
  const projectId = useProjectIdParam();
  const [cards, setCards] = useState<CardState[]>([]);
  const [initError, setInitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (pid: number) => {
    setLoading(true);
    setInitError(null);
    try {
      const [{ providers }, { integrations }] = await Promise.all([
        integrationsAPI.listProviders(),
        integrationsAPI.getAll(pid),
      ]);
      const next: CardState[] = await Promise.all(providers.map(async (provider) => {
        const status = integrations[provider.key] ?? { connected: false };
        let targets: IntegrationTarget[] = [];
        if (status.connected && provider.capabilities.includes('targets')) {
          try {
            targets = (await integrationsAPI.listTargets(pid, provider.key)).targets;
          } catch { /* non-fatal */ }
        }
        return { provider, status, targets, loading: false, error: null, form: {} };
      }));
      setCards(next);
    } catch (e: any) {
      setInitError(e.message || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (projectId) load(projectId); }, [projectId, load]);

  const patchCard = (key: string, patch: Partial<CardState>) =>
    setCards(prev => prev.map(c => c.provider.key === key ? { ...c, ...patch } : c));

  const handleConnectOAuth = async (key: string) => {
    if (!projectId) return;
    patchCard(key, { loading: true, error: null });
    try {
      const d = await integrationsAPI.getConnect(projectId, key);
      if (d.authorize_url) window.location.href = d.authorize_url;
    } catch (e: any) {
      patchCard(key, { loading: false, error: e.message || 'Failed to start connection' });
    }
  };

  const handleConnectForm = async (key: string, form: Record<string, string>) => {
    if (!projectId) return;
    patchCard(key, { loading: true, error: null });
    try {
      const status = await integrationsAPI.connectForm(projectId, key, form);
      patchCard(key, { loading: false, status, form: {} });
    } catch (e: any) {
      patchCard(key, { loading: false, error: e.message || 'Failed to connect' });
    }
  };

  const handleDisconnect = async (key: string, name: string) => {
    if (!projectId) return;
    if (!confirm(`Disconnect ${name} from this project? You can reconnect later.`)) return;
    patchCard(key, { loading: true, error: null });
    try {
      await integrationsAPI.disconnect(projectId, key);
      patchCard(key, { loading: false, status: { connected: false }, targets: [] });
    } catch (e: any) {
      patchCard(key, { loading: false, error: e.message || 'Failed to disconnect' });
    }
  };

  const handleTargetChange = async (key: string, targetId: string) => {
    if (!projectId) return;
    const card = cards.find(c => c.provider.key === key);
    const target = card?.targets.find(t => t.id === targetId);
    if (!target) return;
    patchCard(key, { loading: true });
    try {
      await integrationsAPI.setTarget(projectId, key, target.id, target.name);
      patchCard(key, {
        loading: false,
        status: { ...(card!.status as IntegrationStatus), channel_id: target.id, channel_name: target.name },
      });
    } catch (e: any) {
      patchCard(key, { loading: false, error: e.message || 'Failed to update target' });
    }
  };

  if (!projectId) {
    return <div style={{ fontFamily: tokens.fontFamily.sans, fontSize: 14, color: tokens.colors.semantic.text.secondary }}>Please select a project first.</div>;
  }
  if (loading) {
    return <div style={{ fontFamily: tokens.fontFamily.sans, fontSize: 14, color: tokens.colors.semantic.text.secondary }}>Loading integrations…</div>;
  }
  if (initError) {
    return <div style={{ fontFamily: tokens.fontFamily.sans, fontSize: 14, color: tokens.colors.error[400] }}>{initError}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontFamily: tokens.fontFamily.sans }}>
      {cards.map(card => (
        <IntegrationCard
          key={card.provider.key}
          card={card}
          onConnectOAuth={() => handleConnectOAuth(card.provider.key)}
          onConnectForm={(form) => handleConnectForm(card.provider.key, form)}
          onDisconnect={() => handleDisconnect(card.provider.key, card.provider.name)}
          onTargetChange={(id) => handleTargetChange(card.provider.key, id)}
        />
      ))}
    </div>
  );
}

function IntegrationCard({
  card, onConnectOAuth, onConnectForm, onDisconnect, onTargetChange,
}: {
  card: CardState;
  onConnectOAuth: () => void;
  onConnectForm: (form: Record<string, string>) => void;
  onDisconnect: () => void;
  onTargetChange: (targetId: string) => void;
}) {
  const { provider, status, targets, loading, error } = card;
  const connected = !!status?.connected;
  const hasTargets = provider.capabilities.includes('targets');
  const [form, setForm] = useState<Record<string, string>>({});

  return (
    <div style={{ backgroundColor: tokens.colors.semantic.background.secondary, border: `1px solid ${tokens.colors.semantic.border.default}`, borderRadius: 14, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <ProviderIcon providerKey={provider.key} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: tokens.colors.semantic.text.primary, lineHeight: '24px' }}>{provider.name}</h2>
            {connected && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: tokens.colors.success[100], borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 500, color: tokens.colors.success[700] }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#16a34a', display: 'inline-block' }} />
                Connected
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 14, color: tokens.colors.semantic.text.secondary, lineHeight: '20px' }}>{provider.description}</p>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: tokens.colors.error[400] }}>{error}</p>
        </div>
      )}

      {/* Server-side credentials not set up — don't offer a connect flow that would fail */}
      {!connected && !provider.configured && (
        <div style={{ backgroundColor: '#f3f3f5', border: `1px solid ${tokens.colors.semantic.border.default}`, borderRadius: 8, padding: '10px 14px' }}>
          <p style={{ margin: 0, fontSize: 13, color: tokens.colors.semantic.text.secondary }}>
            Not configured — the server administrator needs to set {provider.name}&apos;s credentials before this integration can be connected.
          </p>
        </div>
      )}

      {/* Not connected */}
      {!connected && provider.configured && provider.connect.mode === 'oauth' && (
        <button onClick={onConnectOAuth} disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', height: 36, backgroundColor: loading ? '#6a7182' : '#611f69', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Redirecting…' : `Connect ${provider.name}`}
        </button>
      )}

      {!connected && provider.connect.mode === 'form' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
          {provider.connect.fields.map(f => (
            <div key={f.key}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: tokens.colors.semantic.text.primary, marginBottom: 6 }}>{f.label}</label>
              <input
                type={f.type === 'password' ? 'password' : 'text'}
                placeholder={f.placeholder}
                value={form[f.key] || ''}
                onChange={(e) => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                style={{ width: '100%', height: 36, padding: '0 12px', backgroundColor: '#f3f3f5', border: 'none', borderRadius: 8, fontSize: 14, color: tokens.colors.neutral[900], outline: 'none' }}
              />
            </div>
          ))}
          <button onClick={() => onConnectForm(form)} disabled={loading}
            style={{ alignSelf: 'flex-start', padding: '8px 16px', height: 36, backgroundColor: loading ? '#6a7182' : tokens.colors.semantic.text.primary, color: tokens.colors.semantic.background.default, border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Saving…' : 'Connect'}
          </button>
        </div>
      )}

      {/* Connected */}
      {connected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {typeof status?.workspace_name === 'string' && (
              <Field label="Workspace" value={status.workspace_name || '—'} />
            )}
            {typeof status?.url === 'string' && (
              <Field label="Endpoint" value={status.url} />
            )}
            {status?.connected_at && (
              <Field label="Connected at" value={new Date(status.connected_at as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
            )}
          </div>

          {hasTargets && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: tokens.colors.semantic.text.primary, marginBottom: 6 }}>Channel</label>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: tokens.colors.semantic.text.secondary }}>Select a channel to receive notifications.</p>
              <select
                value={(status?.channel_id as string) || ''}
                onChange={(e) => onTargetChange(e.target.value)}
                disabled={loading}
                style={{ width: '100%', maxWidth: 360, height: 36, padding: '0 12px', backgroundColor: '#f3f3f5', border: 'none', borderRadius: 8, fontSize: 14, color: tokens.colors.neutral[900], cursor: loading ? 'not-allowed' : 'pointer', outline: 'none', appearance: 'auto' }}
              >
                <option value="">— No channel selected —</option>
                {targets.map(t => (
                  <option key={t.id} value={t.id}>{t.is_private ? '🔒 ' : '#'}{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <button onClick={onDisconnect} disabled={loading}
            style={{ alignSelf: 'flex-start', padding: '6px 12px', height: 34, backgroundColor: 'transparent', color: '#c10007', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer' }}>
            Disconnect {provider.name}
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, minWidth: 160 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: tokens.colors.semantic.text.primary, marginBottom: 6 }}>{label}</label>
      <p style={{ margin: 0, fontSize: 14, color: tokens.colors.semantic.text.secondary, wordBreak: 'break-all' }}>{value}</p>
    </div>
  );
}
