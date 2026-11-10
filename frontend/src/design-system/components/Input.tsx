import React from 'react';
import { tokens } from '../tokens';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  /** Appends a red asterisk to the label to mark the field as required. */
  requiredMark?: boolean;
}

export const Input: React.FC<InputProps> = ({ label, helperText, error, requiredMark, style, ...rest }) => {
  const baseBorderColor = error ? tokens.colors.error[500] : tokens.colors.semantic.border.default;

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing[1], fontFamily: tokens.fontFamily.sans }}>
      {label && (
        <span
          style={{
            fontSize: 14,
            lineHeight: '20px',
            fontWeight: 600,
            color: tokens.colors.semantic.text.primary
          }}
        >
          {label}
          {requiredMark && <span style={{ color: tokens.colors.error[600] }}> *</span>}
        </span>
      )}
      <input
        {...rest}
        style={{
          padding: '8px 12px',
          borderRadius: tokens.borderRadius.md,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: baseBorderColor,
          fontFamily: tokens.fontFamily.sans,
          fontSize: 14,
          lineHeight: '20px',
          outline: 'none',
          backgroundColor: tokens.colors.semantic.background.default,
          color: tokens.colors.semantic.text.primary,
          ...style
        }}
      />
      {(helperText || error) && (
        <span
          style={{
            fontSize: 12,
            lineHeight: '16px',
            color: error ? tokens.colors.error[500] : tokens.colors.semantic.text.tertiary
          }}
        >
          {error ?? helperText}
        </span>
      )}
    </label>
  );
};


