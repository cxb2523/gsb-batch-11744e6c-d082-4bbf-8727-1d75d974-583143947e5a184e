import React from 'react';
import { Camera, Upload, XCircle } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import { FileAttachment } from './types';

interface FileAttachmentsFieldProps {
  files: FileAttachment[];
  setFiles: React.Dispatch<React.SetStateAction<FileAttachment[]>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  acceptAttachments: (incoming: File[]) => File[];
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeFile: (id: string) => void;
  getFileIcon: (file: File | Blob) => React.ReactNode;
}

/** File-attachment upload area with drag/drop, paste and the pending-file list. */
export function FileAttachmentsField({ files, setFiles, fileInputRef, acceptAttachments, handleFileSelect, removeFile, getFileIcon }: FileAttachmentsFieldProps) {
  return (
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: 'block',
              marginBottom: 8,
              fontSize: 14,
              fontWeight: 600,
              color: '#0a0a0a',
              fontFamily: tokens.fontFamily.sans,
            }}
          >
            Attachments
          </label>
          <div
            style={{
              border: '2px dashed rgba(0,0,0,0.1)',
              borderRadius: 8,
              padding: 24,
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: '#f9fafb',
              transition: 'all 150ms ease',
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = tokens.colors.primary[500];
              e.currentTarget.style.backgroundColor = tokens.colors.primary[50];
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)';
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)';
              e.currentTarget.style.backgroundColor = '#f9fafb';
              
              const droppedFiles = Array.from(e.dataTransfer.files);
              const validFiles = acceptAttachments(droppedFiles);

              const newFiles: FileAttachment[] = validFiles.map(file => {
                const id = `${Date.now()}-${Math.random()}`;
                const attachment: FileAttachment = { file, id };
                
                if (file.type.startsWith('image/')) {
                  const reader = new FileReader();
                  reader.onload = (e) => {
                    setFiles(prev => prev.map(f => f.id === id ? { ...f, preview: e.target?.result as string } : f));
                  };
                  reader.readAsDataURL(file);
                }
                
                return attachment;
              });

              setFiles(prev => [...prev, ...newFiles]);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={24} style={{ color: '#717182', marginBottom: 8 }} />
            <p style={{ margin: 0, fontSize: 14, color: '#717182', fontFamily: tokens.fontFamily.sans }}>
              Click to upload, drag and drop, or paste screenshots
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af', fontFamily: tokens.fontFamily.sans }}>
              Images and PDFs only (max 10MB per file) • Paste with Ctrl+V or Cmd+V
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {/* File List - All files including pasted screenshots */}
          {files.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {files.map((fileAttachment) => (
                <div
                  key={fileAttachment.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    backgroundColor: 'white',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: 8,
                    fontSize: 14,
                    fontFamily: tokens.fontFamily.sans,
                  }}
                >
                  {fileAttachment.preview ? (
                    <img
                      src={fileAttachment.preview}
                      alt={fileAttachment.name || 'File'}
                      style={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 4 }}
                    />
                  ) : (
                    getFileIcon(fileAttachment.file)
                  )}
                  <span style={{
                    color: '#0a0a0a',
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    {fileAttachment.name?.startsWith('screenshot-') && (
                      <Camera size={12} />
                    )}
                    {fileAttachment.name || 'Unknown file'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(fileAttachment.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 4,
                      cursor: 'pointer',
                      color: tokens.colors.semantic.text.tertiary,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <XCircle size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
  );
}
