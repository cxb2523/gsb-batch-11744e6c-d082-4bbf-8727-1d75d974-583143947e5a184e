import React from 'react';
import { tokens } from '../tokens';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  size?: number;
  useGradient?: boolean;
  /** Profile photo; initials are shown when absent or if it fails to load. */
  src?: string | null;
  /** Give each person a stable colour instead of the neutral default. */
  colorful?: boolean;
}

// Dark enough for white initials to clear 4.5:1.
const PERSON_COLORS = ['#0055CC', '#5E4DB2', '#216E4E', '#A54800', '#206A83', '#AE2E24', '#943D73', '#44546F'];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function personColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length];
}

export const Avatar: React.FC<AvatarProps> = ({ name, size = 28, useGradient, src, colorful, style, ...rest }) => {
  const [imageFailed, setImageFailed] = React.useState(false);
  const initials = getInitials(name);
  const background = useGradient
    ? 'linear-gradient(135deg, rgba(194, 122, 255, 1) 0%, rgba(246, 51, 154, 1) 100%)'
    : colorful
      ? personColor(name)
      : tokens.colors.neutral[800];
  const showImage = Boolean(src) && !imageFailed;

  return (
    <div
      {...rest}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        overflow: 'hidden',
        borderRadius: tokens.borderRadius.pill,
        background,
        color: '#ffffff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: tokens.fontFamily.sans,
        fontSize: size >= 36 ? Math.round(size * 0.36) : tokens.typography.styles.caption.fontSize,
        fontWeight: tokens.typography.weights.semibold,
        letterSpacing: 0,
        ...style
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt=""
          width={size}
          height={size}
          onError={() => setImageFailed(true)}
          style={{ width: size, height: size, objectFit: 'cover' }}
        />
      ) : (
        initials
      )}
    </div>
  );
};
