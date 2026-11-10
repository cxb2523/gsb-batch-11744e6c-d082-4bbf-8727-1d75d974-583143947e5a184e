import React from 'react';
import { tokens } from '../tokens';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, disabled = false }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative',
        width: 32,
        height: 18,
        // #0052CC: the app's primary colour, same as the primary button and the
        // sidebar's active item. It read as near-black before, which looked like a
        // disabled control rather than an on one.
        backgroundColor: checked ? '#0052CC' : '#cbced4',
        borderRadius: tokens.borderRadius.pill,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 1,
        transition: 'background-color 200ms',
        opacity: disabled ? 0.5 : 1
      }}
    >
      <span
        style={{
          position: 'absolute',
          width: 16,
          height: 16,
          backgroundColor: tokens.colors.semantic.background.default,
          borderRadius: tokens.borderRadius.pill,
          top: 1,
          left: checked ? 15 : 1,
          transition: 'left 200ms'
        }}
      />
    </button>
  );
};
