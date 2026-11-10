'use client';

import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, Edit2, Trash2, X, Check } from 'lucide-react';
import { ticketsAPI, TicketComment } from '../lib/api/tickets';
import { tokens } from '../design-system/tokens';
import { useAuth } from '../hooks/useAuth';
import MentionTextarea, { renderMentionText } from './MentionTextarea';
import { ButtonCore } from './ui';

interface TicketCommentsProps {
  projectId: number;
  ticketId: number;
  onCommentAdded?: () => void;
}

export default function TicketComments({ projectId, ticketId, onCommentAdded }: TicketCommentsProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    loadComments();
  }, [projectId, ticketId]);

  const loadComments = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedComments = await ticketsAPI.getComments(projectId, ticketId);
      setComments(fetchedComments);
    } catch (err) {
      console.error('Failed to load comments:', err);
      setError('Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    try {
      setSubmitting(true);
      setError(null);
      const comment = await ticketsAPI.addComment(projectId, ticketId, newComment.trim());
      setComments(prev => [...prev, comment]);
      setNewComment('');
      if (onCommentAdded) {
        onCommentAdded();
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
      setError('Failed to add comment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClick = (comment: TicketComment) => {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (commentId: number) => {
    if (!editContent.trim()) return;

    try {
      setError(null);
      const updatedComment = await ticketsAPI.updateComment(projectId, ticketId, commentId, editContent.trim());
      setComments(prev => prev.map(c => c.id === commentId ? updatedComment : c));
      setEditingCommentId(null);
      setEditContent('');
    } catch (err) {
      console.error('Failed to update comment:', err);
      setError('Failed to update comment. Please try again.');
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
      setError(null);
      await ticketsAPI.deleteComment(projectId, ticketId, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      console.error('Failed to delete comment:', err);
      setError('Failed to delete comment. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  return (
    <div style={{ fontFamily: tokens.fontFamily.sans }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2], marginBottom: tokens.spacing[4] }}>
        <MessageSquare size={20} color={tokens.colors.semantic.text.primary} />
        <h3 style={{
          margin: 0,
          fontSize: tokens.typography.styles.h4.fontSize,
          fontWeight: tokens.typography.styles.h4.fontWeight,
          color: tokens.colors.semantic.text.primary,
        }}>
          Comments ({comments.length})
        </h3>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: tokens.spacing[3],
          backgroundColor: tokens.colors.error[50],
          border: `1px solid ${tokens.colors.error[200]}`,
          borderRadius: tokens.borderRadius.md,
          color: tokens.colors.error[700],
          fontSize: tokens.typography.styles.bodyMedium.fontSize,
          marginBottom: tokens.spacing[4],
        }}>
          {error}
        </div>
      )}

      {/* Comments List */}
      <div style={{ marginBottom: tokens.spacing[6] }}>
        {loading ? (
          <div style={{ padding: tokens.spacing[4], textAlign: 'center', color: tokens.colors.neutral[500] }}>
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div style={{ padding: tokens.spacing[4], textAlign: 'center', color: tokens.colors.neutral[500] }}>
            No comments yet. Be the first to comment!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing[4] }}>
            {comments.map((comment) => {
              const isEditing = editingCommentId === comment.id;
              const isAuthor = user && comment.author.id === user.id;

              return (
                <div
                  key={comment.id}
                  style={{
                    display: 'flex',
                    gap: tokens.spacing[3],
                    padding: tokens.spacing[3],
                    backgroundColor: tokens.colors.semantic.background.secondary,
                    borderRadius: tokens.borderRadius.md,
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: tokens.borderRadius.pill,
                    backgroundColor: tokens.colors.primary[500],
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: tokens.typography.styles.caption.fontSize,
                    fontWeight: tokens.typography.weights.semibold,
                    flexShrink: 0,
                  }}>
                    {comment.author.initials}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: tokens.spacing[1] }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing[2] }}>
                        <span style={{
                          fontSize: tokens.typography.styles.bodyMedium.fontSize,
                          fontWeight: tokens.typography.weights.semibold,
                          color: tokens.colors.semantic.text.primary,
                        }}>
                          {comment.author.name}
                        </span>
                        <span style={{
                          fontSize: tokens.typography.styles.caption.fontSize,
                          color: tokens.colors.neutral[500],
                        }}>
                          {formatDate(comment.created_at)}
                          {comment.updated_at && ' (edited)'}
                        </span>
                      </div>

                      {/* Edit/Delete buttons - only show for author */}
                      {isAuthor && !isEditing && (
                        <div style={{ display: 'flex', gap: tokens.spacing[2] }}>
                          <button
                            onClick={() => handleEditClick(comment)}
                            style={{
                              padding: 4,
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: tokens.borderRadius.sm,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              color: tokens.colors.neutral[500],
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = tokens.colors.neutral[100]}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            style={{
                              padding: 4,
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: tokens.borderRadius.sm,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              color: tokens.colors.error[500],
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = tokens.colors.error[50]}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Comment content or edit form */}
                    {isEditing ? (
                      <div style={{ marginTop: tokens.spacing[2] }}>
                        <MentionTextarea
                          projectId={projectId}
                          value={editContent}
                          onChange={setEditContent}
                          style={{
                            width: '100%',
                            minHeight: '80px',
                            padding: `12px ${tokens.spacing[3]}`,
                            backgroundColor: tokens.colors.semantic.background.default,
                            border: `1px solid ${tokens.colors.semantic.border.default}`,
                            borderRadius: tokens.borderRadius.md,
                            fontSize: '14px',
                            lineHeight: '1.5',
                            fontFamily: tokens.fontFamily.sans,
                            color: tokens.colors.semantic.text.primary,
                            outline: 'none',
                            boxSizing: 'border-box',
                            marginBottom: tokens.spacing[3],
                          }}
                        />
                        <div style={{ display: 'flex', gap: tokens.spacing[2], justifyContent: 'flex-end', paddingBottom: tokens.spacing[2] }}>
                          <ButtonCore
                            onClick={handleCancelEdit}
                            variant="secondary"
                            size="sm"
                            leftIcon={<X size={14} />}
                          >
                            Cancel
                          </ButtonCore>
                          <ButtonCore
                            onClick={() => handleSaveEdit(comment.id)}
                            disabled={!editContent.trim()}
                            variant="primary"
                            size="sm"
                            leftIcon={<Check size={14} />}
                          >
                            Save
                          </ButtonCore>
                        </div>
                      </div>
                    ) : (
                      <p style={{
                        margin: 0,
                        fontSize: tokens.typography.styles.bodyMedium.fontSize,
                        lineHeight: tokens.typography.styles.bodyMedium.lineHeight,
                        color: tokens.colors.semantic.text.primary,
                        whiteSpace: 'pre-wrap',
                      }}>
                        {renderMentionText(comment.content)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Comment Form */}
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: tokens.spacing[2] }}>
          {user && (
            <div style={{
              width: 32,
              height: 32,
              borderRadius: tokens.borderRadius.pill,
              backgroundColor: tokens.colors.primary[500],
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: tokens.typography.styles.caption.fontSize,
              fontWeight: tokens.typography.weights.semibold,
              flexShrink: 0,
            }}>
              {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <MentionTextarea
              projectId={projectId}
              value={newComment}
              onChange={setNewComment}
              placeholder="Add a comment... Use @ to mention members"
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '12px 12px',
                backgroundColor: '#f3f3f5',
                border: '1px solid rgba(0,0,0,0)',
                borderRadius: tokens.borderRadius.md,
                fontSize: '14px',
                lineHeight: '1.5',
                fontFamily: tokens.fontFamily.sans,
                color: tokens.colors.semantic.text.primary,
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: tokens.spacing[2] }}>
              <ButtonCore
                type="submit"
                variant="primary"
                disabled={!newComment.trim()}
                loading={submitting}
                leftIcon={<Send size={16} />}
              >
                {submitting ? 'Posting...' : 'Post Comment'}
              </ButtonCore>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
