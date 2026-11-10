import React from 'react';
import { X, File } from 'lucide-react';
import { tokens } from '../../design-system/tokens';
import RichTextEditor from '../RichTextEditor';
import { FileAttachment } from './types';

interface DescriptionFieldProps {
  description: string;
  setDescription: React.Dispatch<React.SetStateAction<string>>;
  files: FileAttachment[];
  removeFile: (id: string) => void;
  projectId: number;
  type: string;
}

/** Rich-text description field with inline pasted-attachment previews. */
export function DescriptionField({ description, setDescription, files, removeFile, projectId, type }: DescriptionFieldProps) {
  return (
        <div style={{ marginBottom: 24 }} data-description-field>
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
            Description
            <span style={{
              fontSize: 12,
              fontWeight: 400,
              color: tokens.colors.semantic.text.tertiary,
              marginLeft: 8
            }}>
              (Paste screenshots with Ctrl+V or Cmd+V)
            </span>
          </label>
          <div style={{ position: 'relative' }}>
            <RichTextEditor
              projectId={projectId}
              placeholder={type === 'epic'
                ? "Describe the epic's goal, scope, and expected outcomes. Include business value and success criteria. Use @ to mention stakeholders, paste screenshots with Ctrl/Cmd+V"
                : "Detailed description... Use @ to mention members, paste screenshots with Ctrl/Cmd+V"
              }
              value={description}
              onChange={setDescription}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: 'white',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: 8,
                fontSize: 16,
                fontFamily: tokens.fontFamily.sans,
                color: '#0a0a0a',
                outline: 'none',
                minHeight: type === 'epic' ? 150 : 100,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Attachments confirm themselves right here, where the paste happened. The full
              attachment list lives further down, but a screenshot that lands silently in a
              section you can't see may as well not have been added at all. */}
          {files.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                marginTop: 10,
              }}
            >
              {files.map((f) => (
                <div
                  key={f.id}
                  title={f.name || 'attachment'}
                  style={{
                    position: 'relative',
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid rgba(9,30,66,0.14)',
                    background: '#F4F5F7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {f.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.preview}
                      alt={f.name || 'attachment'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <File size={18} color="#5E6C84" />
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    aria-label="Remove attachment"
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'rgba(9,30,66,0.7)',
                      color: '#FFFFFF',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      lineHeight: 0,
                    }}
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              <span style={{ fontSize: 12, color: '#5E6C84', fontFamily: tokens.fontFamily.sans }}>
                {files.length} attachment{files.length === 1 ? '' : 's'} added
              </span>
            </div>
          )}
        </div>
  );
}
