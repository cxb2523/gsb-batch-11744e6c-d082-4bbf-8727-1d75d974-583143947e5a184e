import React from 'react';
import { Camera, Upload, Eye, Download, XCircle } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { ButtonCore } from '../ui';
import { TicketFile } from '../../lib/api/tickets';
import { getFileVisual } from './utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface AttachmentsSectionProps {
  files: TicketFile[];
  projectId: number;
  ticketId: number;
  isAdmin: boolean;
  isMember: boolean;
  uploading: boolean;
  uploadingScreenshot: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDeleteFile: (fileId: number) => void;
}

/** Attachment list with upload / paste-screenshot, view, download and delete. */
export function AttachmentsSection({ files, projectId, ticketId, isAdmin, isMember, uploading, uploadingScreenshot, fileInputRef, handleFileSelect, handleDeleteFile }: AttachmentsSectionProps) {
  return (
                <div style={{ marginBottom: 40 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: 14,
                          fontWeight: 600,
                          color: tokens.colors.neutral[900],
                        }}
                      >
                        Attachments ({files.length})
                      </h4>
                      {(isAdmin || isMember) && (
                        <p style={{
                          margin: '4px 0 0',
                          fontSize: 11,
                          color: uploadingScreenshot ? tokens.colors.primary[600] : tokens.colors.neutral[500],
                        }}>
                          {uploadingScreenshot
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Camera size={12} /> Uploading screenshot...</span>
                            : 'Paste screenshots with Ctrl+V or Cmd+V'}
                        </p>
                      )}
                    </div>
                    {(isAdmin || isMember) && (
                      <ButtonCore
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        leftIcon={<Upload size={14} />}
                      >
                        {uploading ? 'Uploading...' : 'Upload'}
                      </ButtonCore>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    // Guide the OS picker; the server enforces the real allowlist.
                    accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.pdf,.md,.markdown,.txt,.log,.rtf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.json,.zip"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />

                  {files.length > 0 && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {files.map((file) => {
                        const fileUrl = `${API_URL}/projects/${projectId}/tickets/${ticketId}/files/${file.id}/download`;
                        // Inline view opens in a plain new tab (native browser rendering,
                        // no in-app overlay). Works for every type, not just images.
                        const viewUrl = `${fileUrl}?inline=1`;
                        const openInNewTab = () => window.open(viewUrl, '_blank', 'noopener,noreferrer');
                        const { Icon: FileIcon, color: iconColor } = getFileVisual(file.filename, file.file_type);
                        return (
                          <div
                            key={file.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: 12,
                              backgroundColor: tokens.colors.neutral[50],
                              border: `1px solid ${tokens.colors.neutral[200]}`,
                              borderRadius: 8,
                              cursor: 'pointer',
                            }}
                            onClick={openInNewTab}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <FileIcon size={18} color={iconColor} />
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 500, color: tokens.colors.neutral[900], display: 'flex', alignItems: 'center', gap: 4 }}>
                                  {file.filename?.startsWith('screenshot-') && <Camera size={12} />}
                                  {file.filename}
                                </div>
                                <div style={{ fontSize: 12, color: tokens.colors.neutral[500] }}>
                                  {(file.file_size / 1024).toFixed(1)} KB
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={openInNewTab}
                                title="Open in new tab"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 6,
                                  cursor: 'pointer',
                                  color: tokens.colors.neutral[600],
                                  borderRadius: 4,
                                  display: 'flex',
                                }}
                              >
                                <Eye size={16} />
                              </button>
                              <a
                                href={fileUrl}
                                download
                                title="Download"
                                style={{
                                  color: tokens.colors.primary[600],
                                  textDecoration: 'none',
                                  padding: 6,
                                  borderRadius: 4,
                                  display: 'flex',
                                }}
                              >
                                <Download size={16} />
                              </a>
                              {(isAdmin || isMember) && (
                                <button
                                  onClick={() => handleDeleteFile(file.id)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 6,
                                    cursor: 'pointer',
                                    color: tokens.colors.error[500],
                                    borderRadius: 4,
                                  }}
                                >
                                  <XCircle size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
  );
}
