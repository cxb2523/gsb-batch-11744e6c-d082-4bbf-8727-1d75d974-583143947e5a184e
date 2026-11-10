'use client';

import React, { useState, useEffect } from 'react';
import { useProjectIdParam } from '../../../../../../hooks/useProjectContext';
import { Card, Input, Badge } from '../../../../../../design-system/components';
import { ButtonCore } from '@/components/ui';
import { tokens } from '../../../../../../design-system/tokens';
import { Plus, Pencil, Trash2, Check, X, GripVertical } from 'lucide-react';
import { workflowAPI, WorkflowStatus } from '../../../../../../lib/api/settings';
import { ConfirmDialog } from '../../../../../../components/ui';

interface EditingStatus {
  id: number;
  name: string;
}

/**
 * Renaming a status is not cosmetic. Several backend rules still recognise statuses
 * by name — DONE_STATUS_NAMES in routes/tickets.py decides what counts as done and
 * when completed_at is set, and EVIDENCE_REQUIRED_STATUS_NAMES decides which moves
 * demand a merge request link or a comment. A rename that leaves those lists behind
 * silently changes project behaviour, so it is worth a sentence before it happens.
 */
const RENAME_WARNING =
  'Reports, done-detection and the review evidence check still match some statuses by name. Renaming one can silently change how this project behaves.';

export default function WorkflowSettings() {
  const projectId = useProjectIdParam();
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<EditingStatus | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [pendingRename, setPendingRename] = useState<{ id: number; from: string; to: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  // Dragging now only rearranges the list on screen. The order is written when the
  // admin says so, which also gives them a way to back out of a misdrop.
  const [savedOrder, setSavedOrder] = useState<number[]>([]);

  // Load statuses when project ID changes
  useEffect(() => {
    if (projectId) {
      loadStatuses();
    }
  }, [projectId]);

  const loadStatuses = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await workflowAPI.getStatuses(projectId);
      setSavedOrder(data.map((s) => s.id));
      setStatuses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow statuses');
      console.error('Error loading workflow statuses:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStatus = async () => {
    try {
      setSaving(true);
      setError(null);

      // Calculate next position
      const nextPosition = statuses.length > 0
        ? Math.max(...statuses.map(s => s.position)) + 1
        : 1;

      if (!projectId) return;
      const newStatus = await workflowAPI.createStatus(projectId, {
        name: `New Status`,
        color: '#dbeafe',
        position: nextPosition
      });

      setStatuses([...statuses, newStatus]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add status');
      console.error('Error adding status:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (status: WorkflowStatus) => {
    setEditingStatus({ id: status.id, name: status.name });
  };

  const handleCancelEdit = () => {
    setEditingStatus(null);
  };

  // The tick now asks first. A no-op rename skips the dialog: confirming that
  // nothing will happen is just friction.
  const handleSaveEdit = () => {
    if (!editingStatus) return;
    const current = statuses.find((s) => s.id === editingStatus.id);
    const name = editingStatus.name.trim();
    if (!name || name === current?.name) {
      setEditingStatus(null);
      return;
    }
    setPendingRename({ id: editingStatus.id, from: current?.name ?? '', to: name });
  };

  const confirmRename = async () => {
    if (!pendingRename) return;
    const editingStatus = { id: pendingRename.id, name: pendingRename.to };

    try {
      setSaving(true);
      setError(null);

      if (!projectId) return;
      const updatedStatus = await workflowAPI.updateStatus(
        projectId,
        editingStatus.id,
        { name: editingStatus.name }
      );

      setStatuses(statuses.map(s => s.id === editingStatus.id ? updatedStatus : s));
      setEditingStatus(null);
      setPendingRename(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
      console.error('Error updating status:', err);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (pendingDelete === null) return;
    const statusId = pendingDelete;

    try {
      setDeleting(statusId);
      setError(null);

      if (!projectId) return;
      await workflowAPI.deleteStatus(projectId, statusId);
      setStatuses(statuses.filter(s => s.id !== statusId));
      setPendingDelete(null);
    } catch (err) {
      // The server refuses to delete a status that tickets still use, and says how
      // many. Keep the dialog open so the message lands next to the action.
      setError(err instanceof Error ? err.message : 'Failed to delete status');
      console.error('Error deleting status:', err);
    } finally {
      setDeleting(null);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newStatuses = [...statuses];
    const draggedItem = newStatuses[draggedIndex];
    newStatuses.splice(draggedIndex, 1);
    newStatuses.splice(index, 0, draggedItem);

    setStatuses(newStatuses);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const orderChanged =
    statuses.length === savedOrder.length &&
    statuses.some((status, index) => status.id !== savedOrder[index]);

  const revertOrder = () => {
    const byId = new Map(statuses.map((s) => [s.id, s]));
    setStatuses(savedOrder.map((id) => byId.get(id)!).filter(Boolean));
  };

  const saveOrder = async () => {
    try {
      setSaving(true);
      setError(null);
      if (!projectId) return;

      await Promise.all(
        statuses.map((status, index) =>
          workflowAPI.updateStatus(projectId, status.id, { position: index + 1 })
        )
      );

      await loadStatuses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder statuses');
      console.error('Error reordering statuses:', err);
      // Fall back to the server's order rather than leaving the screen lying.
      await loadStatuses();
    } finally {
      setSaving(false);
    }
  };

  if (!projectId) {
    return (
      <div style={{ padding: 24, fontFamily: tokens.fontFamily.sans }}>
        <p style={{ color: tokens.colors.semantic.text.secondary }}>
          Please select a project to view its workflow settings.
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
                fontSize: 14,
                color: tokens.colors.semantic.text.secondary
              }}
            >
              Loading workflow statuses...
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
              fontWeight: 600,
              lineHeight: '24px',
              color: tokens.colors.semantic.text.primary,
              margin: 0
            }}
          >
            Workflow Configuration
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
            Customize your project workflow
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
            gap: 12
          }}
        >
          {/* Label */}
          <div style={{ marginBottom: 14 }}>
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                lineHeight: '20px',
                color: tokens.colors.semantic.text.primary,
                margin: 0
              }}
            >
              Status Workflow
            </p>
          </div>

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
                  fontSize: 14,
                  color: tokens.colors.error[400],
                  margin: 0
                }}
              >
                {error}
              </p>
            </div>
          )}

          {/* Status Items */}
          {statuses.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {statuses.map((status, index) => (
                <div
                  key={status.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    paddingInline: 13,
                    paddingBlock: 1,
                    minHeight: 58,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderColor: draggedIndex === index ? '#0052CC' : '#DFE1E6',
                    backgroundColor: draggedIndex === index ? '#DEEBFF' : '#FFFFFF',
                    cursor: 'grab',
                    opacity: draggedIndex === index ? 0.5 : 1,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Drag Handle */}
                  <div
                    style={{
                      color: '#5E6C84',
                      cursor: 'grab',
                      display: 'flex',
                      alignItems: 'center',
                      flexShrink: 0
                    }}
                  >
                    <GripVertical size={20} />
                  </div>

                  {/* Number Badge */}
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 32,
                      height: 32,
                      borderRadius: 4,
                      backgroundColor: '#DEEBFF',
                      fontSize: 16,
                      fontWeight: 600,
                      lineHeight: '24px',
                      color: '#0052CC',
                      flexShrink: 0
                    }}
                  >
                    {index + 1}
                  </div>

                  {/* Status Name - Editable */}
                  {editingStatus?.id === status.id ? (
                    <input
                      type="text"
                      value={editingStatus.name}
                      onChange={(e) => setEditingStatus({ ...editingStatus, name: e.target.value })}
                      style={{
                        flex: 1,
                        fontSize: 16,
                        fontWeight: 500,
                        lineHeight: '24px',
                        color: tokens.colors.semantic.text.primary,
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '2px solid #0052CC',
                        outline: 'none',
                        fontFamily: tokens.fontFamily.sans,
                        backgroundColor: '#FFFFFF'
                      }}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        flex: 1,
                        fontSize: 16,
                        fontWeight: 500,
                        lineHeight: '24px',
                        color: '#172B4D'
                      }}
                    >
                      {status.name}
                    </div>
                  )}

                  {/* Action Buttons or Badge */}
                  {editingStatus?.id === status.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        onClick={handleSaveEdit}
                        disabled={saving}
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          border: 'none',
                          backgroundColor: '#0052CC',
                          color: '#FFFFFF',
                          cursor: saving ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={saving}
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          border: '1px solid #DFE1E6',
                          backgroundColor: '#FFFFFF',
                          color: '#42526E',
                          cursor: saving ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Active Badge */}
                      <div
                        style={{
                          backgroundColor: '#E3FCEF',
                          borderRadius: 8,
                          paddingInline: 9,
                          paddingBlock: 3,
                          height: 22
                        }}
                      >
                        <p
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            lineHeight: '16px',
                            color: '#006644',
                            margin: 0
                          }}
                        >
                          Active
                        </p>
                      </div>

                      {/* Edit Button */}
                      <button
                        onClick={() => handleEditClick(status)}
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          border: '1px solid #DFE1E6',
                          backgroundColor: '#FFFFFF',
                          color: '#42526E',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        title="Edit status"
                      >
                        <Pencil size={16} />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => setPendingDelete(status.id)}
                        disabled={deleting === status.id}
                        style={{
                          padding: 6,
                          borderRadius: 6,
                          border: '1px solid #DFE1E6',
                          backgroundColor: '#FFFFFF',
                          color: '#DE350B',
                          cursor: deleting === status.id ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: deleting === status.id ? 0.5 : 1
                        }}
                        title="Delete status"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            !error && (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: tokens.colors.semantic.text.secondary
                }}
              >
                <p style={{ margin: 0 }}>No workflow statuses found. Add your first status to get started.</p>
              </div>
            )
          )}

          {/* Unsaved order */}
          {orderChanged && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 8,
                backgroundColor: '#FFFAE6',
                border: '1px solid #FFE380',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span style={{ fontSize: 14, color: '#172B4D' }}>
                Status order changed. Nothing is saved until you apply it.
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <ButtonCore variant="secondary" onClick={revertOrder} disabled={saving}>
                  Revert
                </ButtonCore>
                <ButtonCore variant="primary" onClick={saveOrder} disabled={saving}>
                  {saving ? 'Saving...' : 'Save order'}
                </ButtonCore>
              </div>
            </div>
          )}

          {/* Add Status Button */}
          <ButtonCore
            variant="primary"
            onClick={handleAddStatus}
            disabled={saving}
            leftIcon={<Plus size={16} />}
            style={{ marginTop: 20, alignSelf: 'flex-end' }}
          >
            {saving ? 'Adding Status...' : 'Add Status'}
          </ButtonCore>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={pendingRename !== null}
        title="Rename this status?"
        confirmLabel="Rename"
        busy={saving}
        onConfirm={confirmRename}
        onCancel={() => setPendingRename(null)}
      >
        <p style={{ margin: '0 0 12px' }}>
          &ldquo;{pendingRename?.from}&rdquo; becomes &ldquo;{pendingRename?.to}&rdquo; for everyone
          working on this project.
        </p>
        <p style={{ margin: 0, color: '#974F0C' }}>{RENAME_WARNING}</p>
      </ConfirmDialog>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete this status?"
        confirmLabel="Delete status"
        destructive
        busy={deleting !== null}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        <p style={{ margin: '0 0 12px' }}>
          &ldquo;{statuses.find((s) => s.id === pendingDelete)?.name}&rdquo; will be removed from
          this project&rsquo;s workflow. This cannot be undone.
        </p>
        <p style={{ margin: 0 }}>
          If any ticket is still in this status the server will refuse, and say how many.
        </p>
      </ConfirmDialog>
    </div>
  );
}
