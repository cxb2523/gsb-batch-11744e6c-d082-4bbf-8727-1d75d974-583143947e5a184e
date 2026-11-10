'use client';

import React, { useState, useEffect } from 'react';
import {
  Cloud,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Clock,
  Info,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { tokens } from '@/design-system/tokens';
import { useCapabilities } from '@/hooks/useCapabilities';
import { ButtonCore } from '@/components/ui';

interface SyncStats {
  total_fetched: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ email: string; error: string }>;
}

interface SyncResult {
  success: boolean;
  message: string;
  stats: SyncStats;
  timestamp: string;
}

interface ConnectionStatus {
  isConnected: boolean;
  message: string;
  lastChecked?: string;
}

export default function GoogleWorkspaceSyncPage() {
  const router = useRouter();
  // Hiding the menu entry is presentation; this is what makes the route itself
  // unreachable by typing the URL. Nothing here works without a Workspace - every
  // button on the page calls /google-sync, which 404s when it is not configured.
  // Wait for the answer before redirecting: null means "not loaded yet", and
  // bouncing an admin off their own sync page on a slow request would be worse than
  // a moment of empty screen.
  const { capabilities } = useCapabilities();
  const hasGoogleWorkspace = capabilities?.google_workspace === true;

  useEffect(() => {
    if (capabilities && !capabilities.google_workspace) {
      router.replace('/admin/team-management');
    }
  }, [capabilities, router]);

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: false,
    message: 'Not tested',
  });
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncResult[]>([]);
  const [excludeSuspended, setExcludeSuspended] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // Load sync history from localStorage
  useEffect(() => {
    const history = localStorage.getItem('googleWorkspaceSyncHistory');
    if (history) {
      try {
        setSyncHistory(JSON.parse(history));
      } catch (e) {
        console.error('Failed to parse sync history:', e);
      }
    }

    const lastSync = localStorage.getItem('lastGoogleWorkspaceSync');
    if (lastSync) {
      try {
        setLastSyncResult(JSON.parse(lastSync));
      } catch (e) {
        console.error('Failed to parse last sync:', e);
      }
    }
  }, []);

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/google-sync/test-connection`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setConnectionStatus({
        isConnected: true,
        message: result.message,
        lastChecked: new Date().toISOString(),
      });
    } catch (err: any) {
      setConnectionStatus({
        isConnected: false,
        message: err.message,
        lastChecked: new Date().toISOString(),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    if (!confirm('This will sync users from Google Workspace. Continue?')) return;

    try {
      setLoading(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/google-sync/users?exclude_suspended=${excludeSuspended}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const result = await response.json();
      const syncResult: SyncResult = {
        ...result,
        timestamp: new Date().toISOString(),
      };

      setLastSyncResult(syncResult);
      localStorage.setItem('lastGoogleWorkspaceSync', JSON.stringify(syncResult));

      // Add to history
      const newHistory = [syncResult, ...syncHistory].slice(0, 10); // Keep last 10
      setSyncHistory(newHistory);
      localStorage.setItem('googleWorkspaceSyncHistory', JSON.stringify(newHistory));

      // Show errors if any
      if (syncResult.stats.errors.length > 0) {
        setShowErrors(true);
      }
    } catch (err: any) {
      alert(`Sync failed:\n\n${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Unknown';
    }
  };

  const getTimeSince = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return 'Unknown';
    }
  };

  // Render nothing until the capability is known, and nothing after that if it is
  // off: the redirect above is already on its way.
  if (!hasGoogleWorkspace) {
    return null;
  }

  return (
    <div
      style={{
        padding: tokens.spacing[8],
        fontFamily: tokens.fontFamily.sans,
        maxWidth: '1400px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: tokens.spacing[8] }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: tokens.spacing[4], marginBottom: tokens.spacing[3] }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: tokens.borderRadius.lg,
              background: `linear-gradient(135deg, ${tokens.colors.primary[500]} 0%, ${tokens.colors.primary[600]} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: tokens.shadows.lg,
            }}
          >
            <Cloud size={28} color="#ffffff" />
          </div>
          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontSize: tokens.typography.sizes['3xl'],
                fontWeight: tokens.typography.weights.bold,
                color: tokens.colors.semantic.text.primary,
                marginBottom: tokens.spacing[2],
                lineHeight: 1.2,
              }}
            >
              Google Workspace Sync
            </h1>
            <p
              style={{
                fontSize: tokens.typography.sizes.base,
                color: tokens.colors.semantic.text.tertiary,
                lineHeight: 1.6,
              }}
            >
              Synchronize users from your Google Workspace directory to keep your team up to date
            </p>
          </div>
        </div>

        {/* Connection Status Banner */}
        <div
          style={{
            marginTop: tokens.spacing[6],
            padding: tokens.spacing[4],
            borderRadius: tokens.borderRadius.lg,
            border: `1px solid ${
              connectionStatus.isConnected
                ? tokens.colors.success[200]
                : connectionStatus.lastChecked
                ? tokens.colors.error[200]
                : tokens.colors.neutral[200]
            }`,
            background: connectionStatus.isConnected
              ? tokens.colors.success[50]
              : connectionStatus.lastChecked
              ? tokens.colors.error[50]
              : tokens.colors.neutral[50],
            display: 'flex',
            alignItems: 'center',
            gap: tokens.spacing[3],
          }}
        >
          {connectionStatus.isConnected ? (
            <CheckCircle2 size={20} color={tokens.colors.success[600]} />
          ) : connectionStatus.lastChecked ? (
            <XCircle size={20} color={tokens.colors.error[600]} />
          ) : (
            <AlertCircle size={20} color={tokens.colors.neutral[500]} />
          )}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: tokens.typography.sizes.sm,
                fontWeight: tokens.typography.weights.semibold,
                color: connectionStatus.isConnected
                  ? tokens.colors.success[700]
                  : connectionStatus.lastChecked
                  ? tokens.colors.error[700]
                  : tokens.colors.neutral[700],
                marginBottom: tokens.spacing[1],
              }}
            >
              {connectionStatus.isConnected ? 'Connected' : connectionStatus.lastChecked ? 'Connection Failed' : 'Not Tested'}
            </div>
            <div
              style={{
                fontSize: tokens.typography.sizes.xs,
                color: tokens.colors.semantic.text.tertiary,
              }}
            >
              {connectionStatus.message}
              {connectionStatus.lastChecked && ` • Tested ${getTimeSince(connectionStatus.lastChecked)}`}
            </div>
          </div>
          <ButtonCore
            variant="secondary"
            onClick={handleTestConnection}
            disabled={testing}
            leftIcon={<Cloud size={16} />}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </ButtonCore>
        </div>
      </div>

      {/* Main Sync Section */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: tokens.borderRadius.xl,
          border: `1px solid ${tokens.colors.neutral[200]}`,
          boxShadow: tokens.shadows.sm,
          overflow: 'hidden',
          marginBottom: tokens.spacing[6],
        }}
      >
        <div
          style={{
            padding: tokens.spacing[6],
            borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
            background: `linear-gradient(to right, ${tokens.colors.primary[50]}, white)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing[4] }}>
            <div>
              <h2
                style={{
                  fontSize: tokens.typography.sizes.xl,
                  fontWeight: tokens.typography.weights.bold,
                  color: tokens.colors.semantic.text.primary,
                  marginBottom: tokens.spacing[2],
                }}
              >
                Sync Users
              </h2>
              <p
                style={{
                  fontSize: tokens.typography.sizes.sm,
                  color: tokens.colors.semantic.text.tertiary,
                }}
              >
                Pull the latest user data from Google Workspace
              </p>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              style={{
                padding: tokens.spacing[2],
                backgroundColor: 'transparent',
                border: `1px solid ${tokens.colors.neutral[300]}`,
                borderRadius: tokens.borderRadius.md,
                cursor: 'pointer',
                color: tokens.colors.semantic.text.secondary,
                display: 'flex',
                alignItems: 'center',
                gap: tokens.spacing[2],
                fontSize: tokens.typography.sizes.sm,
                fontWeight: tokens.typography.weights.medium,
              }}
            >
              <SettingsIcon size={16} />
              {showSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div
              style={{
                padding: tokens.spacing[4],
                backgroundColor: '#ffffff',
                borderRadius: tokens.borderRadius.md,
                border: `1px solid ${tokens.colors.neutral[200]}`,
                marginBottom: tokens.spacing[4],
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: tokens.spacing[3],
                  cursor: 'pointer',
                  fontSize: tokens.typography.sizes.sm,
                  color: tokens.colors.semantic.text.primary,
                }}
              >
                <input
                  type="checkbox"
                  checked={excludeSuspended}
                  onChange={(e) => setExcludeSuspended(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                  }}
                />
                <span>Exclude suspended users from sync</span>
              </label>
              <div
                style={{
                  marginTop: tokens.spacing[2],
                  marginLeft: tokens.spacing[7],
                  fontSize: tokens.typography.sizes.xs,
                  color: tokens.colors.semantic.text.tertiary,
                }}
              >
                When enabled, users marked as suspended in Google Workspace will be skipped during sync
              </div>
            </div>
          )}

          <ButtonCore
            variant="primary"
            onClick={handleSync}
            disabled={loading || !connectionStatus.isConnected}
            leftIcon={<RefreshCw size={20} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />}
          >
            {loading ? 'Syncing...' : 'Start Sync'}
          </ButtonCore>

          {!connectionStatus.isConnected && (
            <div
              style={{
                marginTop: tokens.spacing[3],
                display: 'flex',
                alignItems: 'center',
                gap: tokens.spacing[2],
                fontSize: tokens.typography.sizes.xs,
                color: tokens.colors.semantic.text.tertiary,
              }}
            >
              <Info size={14} />
              <span>Test connection first before syncing</span>
            </div>
          )}
        </div>

        {/* Last Sync Result */}
        {lastSyncResult && (
          <div style={{ padding: tokens.spacing[6] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2], marginBottom: tokens.spacing[4] }}>
              <Clock size={18} color={tokens.colors.semantic.text.tertiary} />
              <h3
                style={{
                  fontSize: tokens.typography.sizes.base,
                  fontWeight: tokens.typography.weights.semibold,
                  color: tokens.colors.semantic.text.secondary,
                }}
              >
                Last Sync
              </h3>
              <span
                style={{
                  fontSize: tokens.typography.sizes.xs,
                  color: tokens.colors.semantic.text.tertiary,
                }}
              >
                {formatTimestamp(lastSyncResult.timestamp)}
              </span>
            </div>

            {/* Stats Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: tokens.spacing[4],
              }}
            >
              {/* Total Fetched */}
              <div
                style={{
                  padding: tokens.spacing[4],
                  borderRadius: tokens.borderRadius.lg,
                  border: `1px solid ${tokens.colors.neutral[200]}`,
                  background: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[3] }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: tokens.borderRadius.md,
                      background: tokens.colors.primary[100],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Users size={20} color={tokens.colors.primary[600]} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: tokens.typography.sizes['2xl'],
                        fontWeight: tokens.typography.weights.bold,
                        color: tokens.colors.semantic.text.primary,
                      }}
                    >
                      {lastSyncResult.stats.total_fetched}
                    </div>
                    <div
                      style={{
                        fontSize: tokens.typography.sizes.xs,
                        color: tokens.colors.semantic.text.tertiary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: tokens.typography.weights.medium,
                      }}
                    >
                      Total Fetched
                    </div>
                  </div>
                </div>
              </div>

              {/* Created */}
              <div
                style={{
                  padding: tokens.spacing[4],
                  borderRadius: tokens.borderRadius.lg,
                  border: `1px solid ${tokens.colors.success[200]}`,
                  background: tokens.colors.success[50],
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[3] }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: tokens.borderRadius.md,
                      background: tokens.colors.success[100],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <UserPlus size={20} color={tokens.colors.success[600]} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: tokens.typography.sizes['2xl'],
                        fontWeight: tokens.typography.weights.bold,
                        color: tokens.colors.success[700],
                      }}
                    >
                      {lastSyncResult.stats.created}
                    </div>
                    <div
                      style={{
                        fontSize: tokens.typography.sizes.xs,
                        color: tokens.colors.success[700],
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: tokens.typography.weights.medium,
                      }}
                    >
                      Created
                    </div>
                  </div>
                </div>
              </div>

              {/* Updated */}
              <div
                style={{
                  padding: tokens.spacing[4],
                  borderRadius: tokens.borderRadius.lg,
                  border: `1px solid ${tokens.colors.primary[200]}`,
                  background: tokens.colors.primary[50],
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[3] }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: tokens.borderRadius.md,
                      background: tokens.colors.primary[100],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <UserCheck size={20} color={tokens.colors.primary[600]} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: tokens.typography.sizes['2xl'],
                        fontWeight: tokens.typography.weights.bold,
                        color: tokens.colors.primary[700],
                      }}
                    >
                      {lastSyncResult.stats.updated}
                    </div>
                    <div
                      style={{
                        fontSize: tokens.typography.sizes.xs,
                        color: tokens.colors.primary[700],
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: tokens.typography.weights.medium,
                      }}
                    >
                      Updated
                    </div>
                  </div>
                </div>
              </div>

              {/* Skipped */}
              <div
                style={{
                  padding: tokens.spacing[4],
                  borderRadius: tokens.borderRadius.lg,
                  border: `1px solid ${tokens.colors.neutral[300]}`,
                  background: tokens.colors.neutral[50],
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[3] }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: tokens.borderRadius.md,
                      background: tokens.colors.neutral[200],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <UserX size={20} color={tokens.colors.neutral[600]} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: tokens.typography.sizes['2xl'],
                        fontWeight: tokens.typography.weights.bold,
                        color: tokens.colors.semantic.text.primary,
                      }}
                    >
                      {lastSyncResult.stats.skipped}
                    </div>
                    <div
                      style={{
                        fontSize: tokens.typography.sizes.xs,
                        color: tokens.colors.semantic.text.tertiary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        fontWeight: tokens.typography.weights.medium,
                      }}
                    >
                      Skipped
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Errors Section */}
            {lastSyncResult.stats.errors.length > 0 && (
              <div style={{ marginTop: tokens.spacing[4] }}>
                <button
                  onClick={() => setShowErrors(!showErrors)}
                  style={{
                    width: '100%',
                    padding: tokens.spacing[3],
                    backgroundColor: tokens.colors.error[50],
                    border: `1px solid ${tokens.colors.error[200]}`,
                    borderRadius: tokens.borderRadius.md,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: tokens.typography.sizes.sm,
                    fontWeight: tokens.typography.weights.medium,
                    color: tokens.colors.error[700],
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2] }}>
                    <XCircle size={18} />
                    <span>{lastSyncResult.stats.errors.length} Error{lastSyncResult.stats.errors.length !== 1 ? 's' : ''}</span>
                  </div>
                  {showErrors ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showErrors && (
                  <div
                    style={{
                      marginTop: tokens.spacing[2],
                      padding: tokens.spacing[3],
                      backgroundColor: '#ffffff',
                      border: `1px solid ${tokens.colors.error[200]}`,
                      borderRadius: tokens.borderRadius.md,
                      maxHeight: '300px',
                      overflowY: 'auto',
                    }}
                  >
                    {lastSyncResult.stats.errors.map((err, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: tokens.spacing[3],
                          marginBottom: idx < lastSyncResult.stats.errors.length - 1 ? tokens.spacing[2] : 0,
                          backgroundColor: tokens.colors.error[50],
                          borderRadius: tokens.borderRadius.sm,
                        }}
                      >
                        <div
                          style={{
                            fontSize: tokens.typography.sizes.sm,
                            fontWeight: tokens.typography.weights.semibold,
                            color: tokens.colors.error[700],
                            marginBottom: tokens.spacing[1],
                          }}
                        >
                          {err.email}
                        </div>
                        <div
                          style={{
                            fontSize: tokens.typography.sizes.xs,
                            color: tokens.colors.error[600],
                          }}
                        >
                          {err.error}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sync History */}
      {syncHistory.length > 0 && (
        <div
          style={{
            background: '#ffffff',
            borderRadius: tokens.borderRadius.xl,
            border: `1px solid ${tokens.colors.neutral[200]}`,
            boxShadow: tokens.shadows.sm,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: tokens.spacing[5],
              borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
            }}
          >
            <h2
              style={{
                fontSize: tokens.typography.sizes.lg,
                fontWeight: tokens.typography.weights.bold,
                color: tokens.colors.semantic.text.primary,
              }}
            >
              Sync History
            </h2>
            <p
              style={{
                fontSize: tokens.typography.sizes.sm,
                color: tokens.colors.semantic.text.tertiary,
                marginTop: tokens.spacing[1],
              }}
            >
              Last {syncHistory.length} sync operations
            </p>
          </div>

          <div style={{ overflow: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: tokens.typography.sizes.sm,
              }}
            >
              <thead>
                <tr style={{ backgroundColor: tokens.colors.neutral[50] }}>
                  <th
                    style={{
                      padding: tokens.spacing[3],
                      textAlign: 'left',
                      fontWeight: tokens.typography.weights.semibold,
                      color: tokens.colors.semantic.text.secondary,
                      fontSize: tokens.typography.sizes.xs,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Timestamp
                  </th>
                  <th
                    style={{
                      padding: tokens.spacing[3],
                      textAlign: 'center',
                      fontWeight: tokens.typography.weights.semibold,
                      color: tokens.colors.semantic.text.secondary,
                      fontSize: tokens.typography.sizes.xs,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Total
                  </th>
                  <th
                    style={{
                      padding: tokens.spacing[3],
                      textAlign: 'center',
                      fontWeight: tokens.typography.weights.semibold,
                      color: tokens.colors.semantic.text.secondary,
                      fontSize: tokens.typography.sizes.xs,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Created
                  </th>
                  <th
                    style={{
                      padding: tokens.spacing[3],
                      textAlign: 'center',
                      fontWeight: tokens.typography.weights.semibold,
                      color: tokens.colors.semantic.text.secondary,
                      fontSize: tokens.typography.sizes.xs,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Updated
                  </th>
                  <th
                    style={{
                      padding: tokens.spacing[3],
                      textAlign: 'center',
                      fontWeight: tokens.typography.weights.semibold,
                      color: tokens.colors.semantic.text.secondary,
                      fontSize: tokens.typography.sizes.xs,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Skipped
                  </th>
                  <th
                    style={{
                      padding: tokens.spacing[3],
                      textAlign: 'center',
                      fontWeight: tokens.typography.weights.semibold,
                      color: tokens.colors.semantic.text.secondary,
                      fontSize: tokens.typography.sizes.xs,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Errors
                  </th>
                  <th
                    style={{
                      padding: tokens.spacing[3],
                      textAlign: 'left',
                      fontWeight: tokens.typography.weights.semibold,
                      color: tokens.colors.semantic.text.secondary,
                      fontSize: tokens.typography.sizes.xs,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {syncHistory.map((sync, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: `1px solid ${tokens.colors.neutral[200]}`,
                    }}
                  >
                    <td style={{ padding: tokens.spacing[3], color: tokens.colors.semantic.text.primary }}>
                      <div>{formatTimestamp(sync.timestamp)}</div>
                      <div
                        style={{
                          fontSize: tokens.typography.sizes.xs,
                          color: tokens.colors.semantic.text.tertiary,
                          marginTop: tokens.spacing[1],
                        }}
                      >
                        {getTimeSince(sync.timestamp)}
                      </div>
                    </td>
                    <td style={{ padding: tokens.spacing[3], textAlign: 'center', color: tokens.colors.semantic.text.primary, fontWeight: tokens.typography.weights.semibold }}>
                      {sync.stats.total_fetched}
                    </td>
                    <td style={{ padding: tokens.spacing[3], textAlign: 'center', color: tokens.colors.success[600], fontWeight: tokens.typography.weights.semibold }}>
                      {sync.stats.created}
                    </td>
                    <td style={{ padding: tokens.spacing[3], textAlign: 'center', color: tokens.colors.primary[600], fontWeight: tokens.typography.weights.semibold }}>
                      {sync.stats.updated}
                    </td>
                    <td style={{ padding: tokens.spacing[3], textAlign: 'center', color: tokens.colors.semantic.text.tertiary }}>
                      {sync.stats.skipped}
                    </td>
                    <td style={{ padding: tokens.spacing[3], textAlign: 'center', color: sync.stats.errors.length > 0 ? tokens.colors.error[600] : tokens.colors.semantic.text.tertiary, fontWeight: sync.stats.errors.length > 0 ? tokens.typography.weights.semibold : tokens.typography.weights.regular }}>
                      {sync.stats.errors.length}
                    </td>
                    <td style={{ padding: tokens.spacing[3] }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: tokens.spacing[1],
                          padding: `${tokens.spacing[1]} ${tokens.spacing[2]}`,
                          borderRadius: tokens.borderRadius.full,
                          fontSize: tokens.typography.sizes.xs,
                          fontWeight: tokens.typography.weights.medium,
                          backgroundColor: sync.success ? tokens.colors.success[100] : tokens.colors.error[100],
                          color: sync.success ? tokens.colors.success[700] : tokens.colors.error[700],
                        }}
                      >
                        {sync.success ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {sync.success ? 'Success' : 'Failed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
