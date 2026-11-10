'use client';

import React from 'react';

/**
 * The one button. See docs/BUTTON_SYSTEM_SPEC.md for the values and the reasoning.
 *
 * Appearance lives entirely in `.btn*` classes in app/globals.css, so hover,
 * focus, active and disabled are declarative and this component holds no state.
 * Callers declare intent (`variant`), never pixels.
 *
 * Imported from `@/components/ui`. This is the only button: the two legacy
 * `Button` shims it used to sit behind have been removed now that every call
 * site uses it directly.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonCoreProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
}

export const ButtonCore = React.forwardRef<HTMLButtonElement, ButtonCoreProps>(
  function ButtonCore(
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      fullWidth = false,
      leftIcon,
      rightIcon,
      disabled,
      className,
      children,
      type,
      ...rest
    },
    ref,
  ) {
    const classes = [
      'btn',
      `btn--${variant}`,
      `btn--${size}`,
      fullWidth ? 'btn--full' : '',
      className ?? '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        {...rest}
        ref={ref}
        // Inside a <form>, an un-typed <button> submits. That has caught out
        // enough of this app's modals that the default is explicit here.
        type={type ?? 'button'}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
      >
        {loading ? <span className="btn__spinner" aria-hidden="true" /> : leftIcon}
        {children}
        {rightIcon}
      </button>
    );
  },
);
