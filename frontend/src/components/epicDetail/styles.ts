import React from 'react';

export const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#6B778C',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: 6,
};

export const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 14,
  color: '#172B4D',
  backgroundColor: '#FAFBFC',
  border: '1px solid #DFE1E6',
  borderRadius: 3,
  outline: 'none',
  fontFamily: 'var(--font-sans)',
  transition: 'background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
};

export const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.currentTarget.style.backgroundColor = '#FFFFFF';
  e.currentTarget.style.borderColor = '#4C9AFF';
  e.currentTarget.style.boxShadow = '0 0 0 2px #DEEBFF';
};

export const handleInputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
  e.currentTarget.style.backgroundColor = '#FAFBFC';
  e.currentTarget.style.borderColor = '#DFE1E6';
  e.currentTarget.style.boxShadow = 'none';
};
