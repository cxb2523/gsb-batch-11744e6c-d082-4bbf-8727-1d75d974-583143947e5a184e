import React from 'react';
import { tokens } from '../tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  withShadow?: boolean;
}

export const Card: React.FC<CardProps> = ({ withShadow = false, style, children, ...rest }) => {
  return (
    <div
      {...rest}
      style={{
        background: tokens.colors.semantic.background.default,
        borderRadius: tokens.borderRadius.md,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: tokens.colors.semantic.border.default,
        boxShadow: withShadow ? tokens.shadows.md : tokens.shadows.card,
        padding: tokens.spacing[4],
        ...style
      }}
    >
      {children}
    </div>
  );
};


