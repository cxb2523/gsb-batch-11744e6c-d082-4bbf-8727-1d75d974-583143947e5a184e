import React from 'react';

export const EmptyState: React.FC<{ icon: React.ReactNode; title: string; hint: string }> = ({ icon, title, hint }) => (
  <div style={{
    textAlign: 'center',
    padding: '48px 24px',
    backgroundColor: '#FAFBFC',
    border: '1px solid #DFE1E6',
    borderRadius: 3,
  }}>
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      marginBottom: 12,
      color: '#97A0AF',
    }}>
      {icon}
    </div>
    <div style={{
      fontSize: 14,
      fontWeight: 600,
      color: '#172B4D',
      marginBottom: 4,
    }}>
      {title}
    </div>
    <div style={{
      fontSize: 13,
      color: '#6B778C',
    }}>
      {hint}
    </div>
  </div>
);
