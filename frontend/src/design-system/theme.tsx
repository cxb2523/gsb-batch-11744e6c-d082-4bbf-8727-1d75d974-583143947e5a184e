'use client';

import React, { PropsWithChildren, createContext, useContext } from 'react';
import type { Theme } from './tokens';
import { theme } from './tokens';

const ThemeContext = createContext<Theme>(theme);

export function ThemeProvider({ children }: PropsWithChildren) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}


