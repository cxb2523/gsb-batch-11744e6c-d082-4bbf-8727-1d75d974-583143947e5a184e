'use client';

import React, { useState, useEffect } from 'react';
import { useProjectIdParam } from '../../../../../../hooks/useProjectContext';
import { Card } from '../../../../../../design-system/components';
import { ButtonCore } from '@/components/ui';
import { tokens } from '../../../../../../design-system/tokens';
import { Plus } from 'lucide-react';
import { labelsAPI, Label } from '../../../../../../lib/api/settings';

export default function LabelsSettings() {
  const projectId = useProjectIdParam();
  const [labels, setLabels] = useState<Label[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load labels when project ID changes
  useEffect(() => {
    if (projectId) {
      loadLabels();
    }
  }, [projectId]);

  const loadLabels = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await labelsAPI.getLabels(projectId);
      setLabels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load labels');
      console.error('Error loading labels:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLabel = async () => {
    if (!newLabel.trim() || !projectId) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const newLabelData = await labelsAPI.createLabel(projectId, {
        name: newLabel.trim(),
        color: '#eceef2'  // Default gray color matching Figma
      });

      setLabels([...labels, newLabelData]);
      setNewLabel('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add label');
      console.error('Error adding label:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !saving) {
      handleAddLabel();
    }
  };

  if (!projectId) {
    return (
      <div style={{ padding: 24, fontFamily: tokens.fontFamily.sans }}>
        <p style={{ color: tokens.colors.semantic.text.secondary }}>
          Please select a project to view its labels.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          fontFamily: tokens.fontFamily.sans
        }}
      >
        <Card style={{ padding: tokens.spacing[1] }}>
          <div
            style={{
              padding: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200
            }}
          >
            <p
              style={{
                fontSize: tokens.typography.styles.bodyMedium.fontSize,
                color: tokens.colors.semantic.text.secondary
              }}
            >
              Loading labels...
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: tokens.fontFamily.sans
      }}
    >
      <Card style={{ padding: tokens.spacing[1] }}>
        {/* Card Header */}
        <div
          style={{
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 500,
              lineHeight: '24px',
              color: tokens.colors.semantic.text.primary,
              margin: 0,
              letterSpacing: '-0.3125px'
            }}
          >
            Labels Management
          </h2>
          <p
            style={{
              fontSize: 16,
              fontWeight: 400,
              lineHeight: '24px',
              color: tokens.colors.semantic.text.secondary,
              margin: 0,
              letterSpacing: '-0.3125px'
            }}
          >
            Create and manage project labels
          </p>
        </div>

        {/* Card Content */}
        <div
          style={{
            paddingInline: 24,
            paddingBlock: 0,
            paddingBottom: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}
        >
          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: 'rgba(239, 68, 68, 0.3)'
              }}
            >
              <p
                style={{
                  fontSize: tokens.typography.styles.bodyMedium.fontSize,
                  color: tokens.colors.error[400],
                  margin: 0
                }}
              >
                {error}
              </p>
            </div>
          )}

          {/* Existing Labels */}
          {labels.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                minHeight: 60
              }}
            >
              {labels.map((label) => (
                <div
                  key={label.id}
                  style={{
                    backgroundColor: '#eceef2',
                    borderRadius: 8,
                    paddingInline: 13,
                    paddingBlock: 5,
                    height: 26,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none'
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      lineHeight: '16px',
                      color: tokens.colors.primary[500],
                      margin: 0
                    }}
                  >
                    {label.name}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            !error && (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: tokens.colors.semantic.text.secondary,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#4B5563'
                }}
              >
                <p style={{ margin: 0 }}>No labels yet. Create your first label to organize issues.</p>
              </div>
            )
          )}

          {/* Add Label Section */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              paddingTop: 16
            }}
          >
            {/* Input */}
            <div style={{ width: 320 }}>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="New label name..."
                onKeyPress={handleKeyPress}
                disabled={saving}
                style={{
                  width: '100%',
                  height: 36,
                  backgroundColor: tokens.colors.semantic.background.secondary,
                  border: `1px solid ${tokens.colors.semantic.border.default}`,
                  borderRadius: 8,
                  paddingInline: 12,
                  paddingBlock: 4,
                  fontSize: 14,
                  fontWeight: 400,
                  color: newLabel ? tokens.colors.semantic.text.primary : tokens.colors.semantic.text.tertiary,
                  fontFamily: tokens.fontFamily.sans,
                  outline: 'none',
                  letterSpacing: '-0.1504px'
                }}
              />
            </div>

            {/* Add Button */}
            <ButtonCore
              variant="primary"
              onClick={handleAddLabel}
              disabled={saving || !newLabel.trim()}
              leftIcon={<Plus size={16} />}
            >
              {saving ? 'Adding...' : 'Add Label'}
            </ButtonCore>
          </div>
        </div>
      </Card>
    </div>
  );
}
