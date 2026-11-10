import React from 'react';
import { Plus, Rocket } from 'lucide-react';
import { ButtonCore } from '@/components/ui';
import { Release } from '@/lib/api/releases';
import { Pill } from './Pill';
import { EmptyState } from './EmptyState';
import { getEnvVisual, getDeployStatusVisual } from './constants';
import { sectionHeadingStyle } from './styles';

interface DeploymentsTabProps {
  release: Release;
  onRecordDeployment: () => void;
}

export function DeploymentsTab({ release, onRecordDeployment }: DeploymentsTabProps) {
  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}>
        <h3 style={{ ...sectionHeadingStyle, marginBottom: 0 }}>Deployment history</h3>
        <ButtonCore variant="primary" onClick={onRecordDeployment} leftIcon={<Plus size={14} />}>
          Record deployment
        </ButtonCore>
      </div>

      {release.deployments && release.deployments.length > 0 ? (
        <div style={{
          border: '1px solid #DFE1E6',
          borderRadius: 3,
          backgroundColor: '#FFFFFF',
        }}>
          {release.deployments.map((deployment, index) => {
            const envV = getEnvVisual(deployment.environment);
            const statV = getDeployStatusVisual(deployment.status);
            return (
              <div
                key={index}
                style={{
                  padding: 16,
                  borderBottom: index < release.deployments!.length - 1 ? '1px solid #DFE1E6' : 'none',
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 8,
                  gap: 12,
                  flexWrap: 'wrap',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Pill label={envV.label} color={envV.color} bg={envV.bg} />
                    <span style={{
                      fontSize: 12,
                      color: '#6B778C',
                    }}>
                      {new Date(deployment.deployed_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <Pill label={statV.label} color={statV.color} bg={statV.bg} />
                </div>
                {deployment.deployed_by_name && (
                  <div style={{
                    fontSize: 13,
                    color: '#42526E',
                    marginBottom: 4,
                  }}>
                    Deployed by {deployment.deployed_by_name}
                  </div>
                )}
                {deployment.commit_hash && (
                  <div style={{
                    fontSize: 13,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    color: '#42526E',
                    marginBottom: 4,
                  }}>
                    Commit: <span style={{ color: '#0052CC' }}>{deployment.commit_hash.substring(0, 8)}</span>
                  </div>
                )}
                {deployment.notes && (
                  <div style={{
                    marginTop: 8,
                    padding: 10,
                    backgroundColor: '#FAFBFC',
                    border: '1px solid #DFE1E6',
                    borderRadius: 3,
                    fontSize: 13,
                    color: '#42526E',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {deployment.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Rocket size={28} />}
          title="No deployments recorded"
          hint='Click "Record deployment" to track where this release is deployed'
        />
      )}
    </div>
  );
}
