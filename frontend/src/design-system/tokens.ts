// Grid Design System Tokens - Modern Design
// Inspired by Linear, Notion, and modern web applications

export const colors = {
  primary: {
    // One blue. The tokens previously said #2B8FFF while components hardcoded
    // #0052CC in dozens of places, so the same "brand" colour rendered two ways
    // depending on the screen. These are the values already in use.
    50: '#E9F2FF',
    100: '#CCE0FF',
    200: '#A6C8FF',
    300: '#7AA9FF',
    400: '#4C9AFF',
    500: '#0052CC',
    600: '#0047B3',
    700: '#003C99',
    800: '#00317F',
    900: '#002766'
  },
  // Accent Glow Special Effects - Toned down for professionalism
  arc: {
    glow: '#40C5E5',      // Softer cyan glow
    core: '#2B8FFF',      // Professional electric blue
    pulse: '#5BA8FF',     // Gentle pulsing blue
    energy: '#94CAFF',    // Subtle energy field
  },
  neon: {
    cyan: '#22B8CF',      // Toned down cyan
    blue: '#2B8FFF',      // Professional blue
    purple: '#8B5CF6',    // Softer purple
    pink: '#EC4899',      // Keep for accents
    green: '#10B981',     // Keep success green
    yellow: '#F59E0B',    // Professional amber
    orange: '#F97316',    // Keep warning orange
  },
  neutral: {
    // Low-chroma greys, matching the values already hardcoded across the app.
    // The old ramp carried a blue cast that made every surface look slightly tinted.
    50: '#FAFBFC',
    100: '#F4F5F7',
    200: '#EBECF0',
    300: '#DFE1E6',
    400: '#C1C7D0',
    500: '#8993A4',
    600: '#6B778C',
    700: '#505F79',
    800: '#344563',
    900: '#172B4D'
  },
  success: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
    800: '#065F46',
    900: '#064E3B'
  },
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F'
  },
  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D'
  },
  info: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A'
  },
  status: {
    backlog: {
      bg: '#F5F7FA',
      border: '#DFE4EA',
      text: '#7D8695'
    },
    todo: {
      bg: '#F0F7FF',
      border: '#C7E1FF',
      text: '#2B8FFF'
    },
    inProgress: {
      bg: '#FFF8E6',
      border: '#FFE8A3',
      text: '#F59E0B'
    },
    done: {
      bg: '#ECFDF5',
      border: '#A7F3D0',
      text: '#10B981'
    }
  },
  semantic: {
    background: {
      default: '#FFFFFF',
      secondary: '#FAFBFC',
      tertiary: '#F5F7FA',
      hover: '#F0F7FF',     // Lighter blue tint on hover
      active: '#E0EFFF'      // Subtle blue on active
    },
    border: {
      default: '#EBF0F5',    // Lighter borders
      subtle: '#F5F7FA',
      hover: '#DFE4EA',
      focus: '#2B8FFF',      // Updated to new primary
      error: '#EF4444'
    },
    text: {
      primary: '#3E4451',    // Slightly lighter for better readability
      secondary: '#5C6370',
      tertiary: '#7D8695',
      disabled: '#B4BAC5',
      inverse: '#FFFFFF'
    }
  }
} as const;

export const gradients = {
  primary: 'linear-gradient(135deg, #2B8FFF 0%, #5BA8FF 100%)',
  primarySubtle: 'linear-gradient(135deg, #F0F7FF 0%, #E0EFFF 100%)',
  dark: 'linear-gradient(135deg, #282C34 0%, #3E4451 100%)',
  glass: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.6) 100%)',
  cardHover: 'linear-gradient(135deg, rgba(43,143,255,0.04) 0%, rgba(91,168,255,0.04) 100%)',
  // Accent Glow - Subtle yet distinctive
  accentGlow: 'radial-gradient(circle, #40C5E5 0%, #2B8FFF 50%, #1A75E8 100%)',
  energyField: 'linear-gradient(135deg, #40C5E5 0%, #2B8FFF 50%, #8B5CF6 100%)',
  neonBlue: 'linear-gradient(135deg, #22B8CF 0%, #2B8FFF 50%, #1A75E8 100%)',
  neonPurple: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
  holographic: 'linear-gradient(135deg, #22B8CF 0%, #2B8FFF 25%, #8B5CF6 50%, #EC4899 75%, #F97316 100%)',
  success: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
  warning: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
  danger: 'linear-gradient(135deg, #EF4444 0%, #F87171 100%)',
} as const;

export const radii = {
  none: '0px',
  xs: '4px',
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '24px',
  '3xl': '32px',
  full: '9999px',
  pill: '9999px'
} as const;

export const shadows = {
  none: 'none',
  xs: '0px 1px 2px 0px rgba(0, 0, 0, 0.05)',
  sm: '0px 2px 4px 0px rgba(0, 0, 0, 0.06), 0px 1px 2px 0px rgba(0, 0, 0, 0.03)',
  md: '0px 4px 8px 0px rgba(0, 0, 0, 0.08), 0px 2px 4px 0px rgba(0, 0, 0, 0.04)',
  lg: '0px 8px 16px 0px rgba(0, 0, 0, 0.10), 0px 4px 8px 0px rgba(0, 0, 0, 0.05)',
  xl: '0px 16px 32px 0px rgba(0, 0, 0, 0.12), 0px 8px 16px 0px rgba(0, 0, 0, 0.06)',
  '2xl': '0px 24px 48px 0px rgba(0, 0, 0, 0.15), 0px 12px 24px 0px rgba(0, 0, 0, 0.08)',
  inner: 'inset 0px 2px 4px 0px rgba(0, 0, 0, 0.06)',
  primaryGlow: '0px 8px 24px 0px rgba(43, 143, 255, 0.15)',
  successGlow: '0px 8px 24px 0px rgba(16, 185, 129, 0.15)',
  errorGlow: '0px 8px 24px 0px rgba(239, 68, 68, 0.15)',
  glass: '0px 8px 32px 0px rgba(0, 0, 0, 0.06), inset 0px 1px 1px 0px rgba(255, 255, 255, 0.8)',
  card: '0px 2px 4px 0px rgba(0, 0, 0, 0.04)',
  // Accent Glows - Professional & Refined
  arcGlow: '0px 0px 32px 4px rgba(64, 197, 229, 0.3), 0px 0px 16px 2px rgba(43, 143, 255, 0.2)',
  arcPulse: '0px 0px 40px 6px rgba(64, 197, 229, 0.25), 0px 0px 20px 3px rgba(43, 143, 255, 0.2), inset 0px 0px 16px 1px rgba(255, 255, 255, 0.2)',
  neonCyan: '0px 0px 24px 3px rgba(34, 184, 207, 0.3), 0px 4px 16px 0px rgba(34, 184, 207, 0.2)',
  neonPurple: '0px 0px 24px 3px rgba(139, 92, 246, 0.3), 0px 4px 16px 0px rgba(139, 92, 246, 0.2)',
  energyField: '0px 0px 36px 5px rgba(64, 197, 229, 0.25), 0px 8px 24px 0px rgba(43, 143, 255, 0.2)',
  holographic: '0px 0px 32px 4px rgba(43, 143, 255, 0.25), 0px 0px 16px 2px rgba(139, 92, 246, 0.2), 0px 4px 20px 0px rgba(236, 72, 153, 0.15)',
} as const;

export const space = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
  32: '128px'
} as const;

export const zIndex = {
  base: 0,
  dropdown: 500,
  sticky: 200,
  fixed: 300,
  modalBackdrop: 400,
  modal: 500,
  popover: 600,
  tooltip: 700,
  nav: 400,
  modals: 1000,
  toasts: 1100
} as const;

export const fontFamily = {
  // Points at the face next/font actually loaded (see globals.css / layout.tsx).
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)'
} as const;

export const fontSize = {
  xs: '11px',
  sm: '13px',
  base: '15px',
  md: '16px',
  lg: '18px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '30px',
  '4xl': '36px',
  '5xl': '48px'
} as const;

export const fontWeight = {
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800
} as const;

export const lineHeight = {
  tight: 1.2,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2
} as const;

export const letterSpacing = {
  tighter: '-0.04em',
  tight: '-0.02em',
  normal: '0em',
  wide: '0.02em',
  wider: '0.04em'
} as const;

export const textStyles = {
  // Display styles
  displayLarge: {
    fontSize: '48px',
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: '-0.04em'
  },
  displayMedium: {
    fontSize: '36px',
    lineHeight: 1.2,
    fontWeight: 700,
    letterSpacing: '-0.02em'
  },

  // Heading styles
  h1: {
    fontSize: '30px',
    lineHeight: 1.3,
    fontWeight: 600,
    letterSpacing: '-0.02em'
  },
  h2: {
    fontSize: '24px',
    lineHeight: 1.3,
    fontWeight: 600,
    letterSpacing: '-0.01em'
  },
  h3: {
    fontSize: '20px',
    lineHeight: 1.4,
    fontWeight: 600,
    letterSpacing: '-0.01em'
  },
  h4: {
    fontSize: '18px',
    lineHeight: 1.4,
    fontWeight: 600,
    letterSpacing: '0em'
  },

  // Body styles
  bodyLarge: {
    fontSize: '16px',
    lineHeight: 1.5,
    fontWeight: 400
  },
  bodyMedium: {
    fontSize: '15px',
    lineHeight: 1.5,
    fontWeight: 400
  },
  bodySmall: {
    fontSize: '13px',
    lineHeight: 1.5,
    fontWeight: 400
  },

  // UI styles
  buttonLarge: {
    fontSize: '15px',
    lineHeight: 1,
    fontWeight: 500,
    letterSpacing: '0.01em'
  },
  buttonMedium: {
    fontSize: '14px',
    lineHeight: 1,
    fontWeight: 500
  },
  buttonSmall: {
    fontSize: '13px',
    lineHeight: 1,
    fontWeight: 500
  },

  // Specialized
  label: {
    fontSize: '13px',
    lineHeight: 1.4,
    fontWeight: 500,
    letterSpacing: '0.01em'
  },
  caption: {
    fontSize: '12px',
    lineHeight: 1.4,
    fontWeight: 400
  },
  overline: {
    fontSize: '11px',
    lineHeight: 1.4,
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const
  },
  code: {
    fontSize: '13px',
    lineHeight: 1.6,
    fontWeight: 400,
    fontFamily: 'var(--font-mono)'
  }
} as const;

export const breakpoints = {
  mobile: '0px',
  tablet: '640px',
  desktop: '1024px',
  wide: '1440px'
} as const;

export const layout = {
  sidebar: {
    collapsed: '72px',
    expanded: '280px',
    transition: '250ms cubic-bezier(0.4, 0, 0.2, 1)'
  },
  topbar: {
    height: '60px'
  },
  content: {
    maxWidth: '1440px',
    padding: '32px'
  },
  modal: {
    small: '480px',
    medium: '640px',
    large: '800px',
    xlarge: '1024px'
  }
} as const;

export const animation = {
  duration: {
    instant: '75ms',
    fast: '150ms',
    normal: '250ms',
    slow: '350ms',
    slower: '500ms'
  },
  easing: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    smooth: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    spring: 'cubic-bezier(0.5, 1.5, 0.5, 1)'
  }
} as const;

export const theme = {
  colors,
  gradients,
  radii,
  shadows,
  space,
  zIndex,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  textStyles,
  breakpoints,
  layout,
  animation
} as const;

// Convenience export with common aliases
export const tokens = {
  colors,
  gradients,
  borderRadius: radii,
  shadows,
  spacing: space,
  typography: {
    sizes: fontSize,
    weights: fontWeight,
    lineHeights: lineHeight,
    letterSpacing,
    styles: textStyles
  },
  zIndex,
  fontFamily,
  breakpoints,
  layout,
  animation
} as const;

export type Theme = typeof theme;
export type Tokens = typeof tokens;
