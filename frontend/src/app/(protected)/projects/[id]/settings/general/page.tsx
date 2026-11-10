'use client';

import React, { useState, useEffect } from 'react';
import { useProjectIdParam } from '../../../../../../hooks/useProjectContext';
import { Card, Input } from '../../../../../../design-system/components';
import { ButtonCore } from '@/components/ui';
import { tokens } from '../../../../../../design-system/tokens';
import { settingsAPI, ProjectSettings } from '../../../../../../lib/api/settings';

export default function GeneralSettings() {
  const projectId = useProjectIdParam();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectKey, setProjectKey] = useState('');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [status, setStatus] = useState<'active' | 'archived'>('active');

  // Load project settings when project ID changes
  useEffect(() => {
    if (projectId) {
      loadProjectSettings();
    }
  }, [projectId]);

  const loadProjectSettings = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const settings = await settingsAPI.getProjectSettings(projectId);
      setProjectKey(settings.key);
      setProjectName(settings.name);
      setDescription(settings.description);
      setVisibility(settings.visibility);
      // Legacy projects may still be stored as 'in_progress'/'done'; collapse to 'active'.
      setStatus(settings.status === 'archived' ? 'archived' : 'active');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project settings');
      console.error('Error loading project settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!projectId) return;
    try {
      setSaving(true);
      setError(null);
      await settingsAPI.updateProjectSettings(projectId, {
        name: projectName,
        description,
        visibility,
        status,
      });
      alert('Project settings saved successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project settings');
      console.error('Error saving project settings:', err);
      alert('Failed to save project settings');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!projectId) return;
    if (!confirm('Are you sure you want to archive this project? This action cannot be undone.')) {
      return;
    }

    try {
      setArchiving(true);
      setError(null);
      await settingsAPI.archiveProject(projectId);
      alert('Project archived successfully!');
      // TODO: Redirect to projects list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive project');
      console.error('Error archiving project:', err);
      alert('Failed to archive project');
    } finally {
      setArchiving(false);
    }
  };

  if (!projectId) {
    return (
      <div style={{ padding: 24, fontFamily: tokens.fontFamily.sans }}>
        <p style={{ color: tokens.colors.neutral[300] }}>
          Please select a project to view its settings.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 24, fontFamily: tokens.fontFamily.sans }}>
        Loading project settings...
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        fontFamily: tokens.fontFamily.sans
      }}
    >
      {/* Project Details Card */}
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
              fontWeight: 600,
              lineHeight: '24px',
              color: tokens.colors.semantic.text.primary,
              margin: 0
            }}
          >
            Project Details
          </h2>
          <p
            style={{
              fontSize: 14,
              fontWeight: 400,
              lineHeight: '20px',
              color: tokens.colors.semantic.text.secondary,
              margin: 0
            }}
          >
            Update your project information and settings
          </p>
        </div>

        {/* Card Content */}
        <div
          style={{
            paddingInline: 24,
            paddingBlock: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            paddingBottom: 24
          }}
        >
          {/* Project Key */}
          <Input
            label="Project Key"
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value)}
            disabled
            style={{
              backgroundColor: tokens.colors.neutral[50],
              cursor: 'not-allowed'
            }}
          />

          {/* Project Name */}
          <Input
            label="Project Name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Enter project name"
          />

          {/* Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing[1] }}>
            <label
              style={{
                fontSize: 14,
                lineHeight: '20px',
                fontWeight: 600,
                color: tokens.colors.semantic.text.primary
              }}
            >
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter project description"
              rows={4}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: tokens.colors.semantic.border.default,
                fontFamily: tokens.fontFamily.sans,
                fontSize: 14,
                lineHeight: '20px',
                outline: 'none',
                resize: 'vertical',
                backgroundColor: tokens.colors.semantic.background.secondary,
                color: tokens.colors.semantic.text.primary
              }}
            />
          </div>

          {/* Project Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing[1] }}>
            <label
              htmlFor="project-status"
              style={{
                fontSize: 14,
                lineHeight: '20px',
                fontWeight: 600,
                color: tokens.colors.semantic.text.primary
              }}
            >
              Project Status
            </label>
            <select
              id="project-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: tokens.colors.semantic.border.default,
                fontFamily: tokens.fontFamily.sans,
                fontSize: 14,
                lineHeight: '20px',
                outline: 'none',
                backgroundColor: tokens.colors.semantic.background.secondary,
                color: tokens.colors.semantic.text.primary,
                cursor: 'pointer'
              }}
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <p
              style={{
                fontSize: 12,
                lineHeight: '16px',
                color: tokens.colors.semantic.text.secondary,
                margin: 0
              }}
            >
              Set the current status of this project
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              padding: 12,
              backgroundColor: tokens.colors.error[50],
              borderRadius: 8,
              color: tokens.colors.error[700],
              fontSize: tokens.typography.styles.bodyMedium.fontSize
            }}>
              {error}
            </div>
          )}

          {/* Save Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <ButtonCore variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </ButtonCore>
          </div>
        </div>
      </Card>

      {/* Danger Zone Card */}
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
              fontWeight: 600,
              lineHeight: '24px',
              color: tokens.colors.semantic.text.primary,
              margin: 0
            }}
          >
            Danger Zone
          </h2>
          <p
            style={{
              fontSize: 14,
              fontWeight: 400,
              lineHeight: '20px',
              color: tokens.colors.semantic.text.secondary,
              margin: 0
            }}
          >
            Irreversible and destructive actions
          </p>
        </div>

        {/* Card Content */}
        <div
          style={{
            paddingInline: 24,
            paddingBlock: 0,
            paddingBottom: 24
          }}
        >
          {/* Warning Box */}
          <div
            style={{
              padding: 16,
              borderRadius: 8,
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  lineHeight: '24px',
                  color: tokens.colors.error[400],
                  margin: 0
                }}
              >
                Archive Project
              </h3>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 400,
                  lineHeight: '20px',
                  color: tokens.colors.error[300],
                  margin: 0
                }}
              >
                Archive this project and all its data
              </p>
            </div>
            <ButtonCore variant="danger" onClick={handleArchive} disabled={archiving}>
              {archiving ? 'Archiving...' : 'Archive'}
            </ButtonCore>
          </div>
        </div>
      </Card>
    </div>
  );
}
