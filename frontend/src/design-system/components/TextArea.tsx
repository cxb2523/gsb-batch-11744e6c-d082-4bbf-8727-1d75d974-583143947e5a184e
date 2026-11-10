import React from 'react';
import { tokens } from '../tokens';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({ label, helperText, error, style, ...rest }) => {
  const baseBorderColor = error ? '#fb2c36' : tokens.colors.neutral[300];

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing[1], fontFamily: tokens.fontFamily.sans }}>
      {label && (
        <span
          style={{
            fontSize: tokens.typography.styles.bodyMedium.fontSize,
            lineHeight: `${tokens.typography.styles.bodyMedium.lineHeight}px`,
            fontWeight: tokens.typography.weights.semibold,
            color: tokens.colors.neutral[700]
          }}
        >
          {label}
        </span>
      )}
      <textarea
        {...rest}
        style={{
          padding: `${tokens.spacing[2]}px ${tokens.spacing[3]}px`,
          borderRadius: tokens.borderRadius.md,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: baseBorderColor,
          fontFamily: tokens.fontFamily.sans,
          fontSize: tokens.typography.styles.bodyMedium.fontSize,
          lineHeight: `${tokens.typography.styles.bodyMedium.lineHeight}px`,
          outline: 'none',
          backgroundColor: '#ffffff',
          resize: 'vertical',
          minHeight: 80,
          ...style
        }}
      />
      {(helperText || error) && (
        <span
          style={{
            fontSize: tokens.typography.styles.caption.fontSize,
            lineHeight: `${tokens.typography.styles.caption.lineHeight}px`,
            color: error ? '#fb2c36' : tokens.colors.neutral[500]
          }}
        >
          {error ?? helperText}
        </span>
      )}
    </label>
  );
};


