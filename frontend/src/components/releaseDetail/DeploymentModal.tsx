import React from 'react';
import { X } from 'lucide-react';
import { ButtonCore } from '@/components/ui';
import { DeploymentCreateData } from '@/lib/api/releases';
import { ENVIRONMENTS } from './constants';
import { sectionLabelStyle, inputBaseStyle, secondaryBtn, handleInputFocus, handleInputBlur } from './styles';

interface DeploymentModalProps {
  deploymentFormData: DeploymentCreateData;
  setDeploymentFormData: React.Dispatch<React.SetStateAction<DeploymentCreateData>>;
  handleDeploymentSubmit: (e: React.FormEvent) => void;
  isDeploying: boolean;
  onClose: () => void;
}

export function DeploymentModal({
  deploymentFormData,
  setDeploymentFormData,
  handleDeploymentSubmit,
  isDeploying,
  onClose,
}: DeploymentModalProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(9, 30, 66, 0.54)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1001,
      fontFamily: 'var(--font-sans)',
    }}>
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #DFE1E6',
        borderRadius: 3,
        maxWidth: 480,
        width: '90%',
        boxShadow: '0px 8px 24px rgba(9, 30, 66, 0.12)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #DFE1E6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{
            fontSize: 16,
            fontWeight: 600,
            color: '#172B4D',
            margin: 0,
            letterSpacing: '-0.01em',
          }}>
            Record deployment
          </h3>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              background: 'transparent',
              border: 'none',
              borderRadius: 3,
              color: '#42526E',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F4F5F7';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleDeploymentSubmit}>
          <div style={{ padding: 24 }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...sectionLabelStyle, display: 'block' }}>Environment</label>
              <select
                value={deploymentFormData.environment}
                onChange={(e) => setDeploymentFormData({ ...deploymentFormData, environment: e.target.value as any })}
                style={inputBaseStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              >
                {ENVIRONMENTS.map(env => (
                  <option key={env.value} value={env.value}>{env.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ ...sectionLabelStyle, display: 'block' }}>Status</label>
              <select
                value={deploymentFormData.status}
                onChange={(e) => setDeploymentFormData({ ...deploymentFormData, status: e.target.value as any })}
                style={inputBaseStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              >
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="in_progress">In Progress</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ ...sectionLabelStyle, display: 'block' }}>Commit hash (optional)</label>
              <input
                type="text"
                value={deploymentFormData.commit_hash}
                onChange={(e) => setDeploymentFormData({ ...deploymentFormData, commit_hash: e.target.value })}
                placeholder="abc123def456"
                style={{
                  ...inputBaseStyle,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>

            <div style={{ marginBottom: 0 }}>
              <label style={{ ...sectionLabelStyle, display: 'block' }}>Notes (optional)</label>
              <textarea
                value={deploymentFormData.notes}
                onChange={(e) => setDeploymentFormData({ ...deploymentFormData, notes: e.target.value })}
                placeholder="Add any notes about this deployment..."
                rows={3}
                style={{
                  ...inputBaseStyle,
                  resize: 'vertical',
                }}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
            </div>
          </div>

          <div style={{
            padding: '12px 24px',
            borderTop: '1px solid #DFE1E6',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}>
            <button
              type="button"
              onClick={onClose}
              style={secondaryBtn}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F4F5F7';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Cancel
            </button>
            <ButtonCore type="submit" variant="primary" disabled={isDeploying}>
              {isDeploying ? 'Recording...' : 'Record deployment'}
            </ButtonCore>
          </div>
        </form>
      </div>
    </div>
  );
}
