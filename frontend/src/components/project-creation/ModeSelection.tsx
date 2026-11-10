'use client';

import React from 'react';
import { Card } from '@/design-system/components/Card';
import { ButtonCore } from '@/components/ui';
import { colors } from '@/design-system/tokens';
import { GridLogo } from '@/components/GridLogo';

interface ModeSelectionProps {
  onSelectMode: (mode: 'blank' | 'excel') => void;
}

export const ModeSelection: React.FC<ModeSelectionProps> = ({ onSelectMode }) => {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px' }}>
      {/* Logo */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
        <GridLogo variant="full" size={44} theme="light" />
      </div>

      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1
          style={{
            fontSize: '36px',
            fontWeight: 700,
            color: colors.semantic.text.primary,
            marginBottom: '12px',
            letterSpacing: '-0.02em',
          }}
        >
          Create a New Project
        </h1>
        <p
          style={{
            fontSize: '16px',
            color: colors.semantic.text.secondary,
            maxWidth: '600px',
            margin: '0 auto',
          }}
        >
          Choose how you&apos;d like to set up your project.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Blank Project Mode */}
        <Card
          style={{
            padding: '32px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            border: `2px solid ${colors.semantic.border.default}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = colors.success[500];
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = colors.semantic.border.default;
            e.currentTarget.style.boxShadow = 'none';
          }}
          onClick={() => onSelectMode('blank')}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              background: colors.success[100],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.success[600]}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>

          <h3
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: colors.semantic.text.primary,
              marginBottom: '8px',
            }}
          >
            Blank Project
          </h3>

          <p
            style={{
              fontSize: '14px',
              color: colors.semantic.text.secondary,
              lineHeight: 1.6,
              marginBottom: '20px',
            }}
          >
            Start with a basic project structure. Add epics and tickets manually as you go.
          </p>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: colors.semantic.text.tertiary, marginBottom: '8px' }}>
              Best for:
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: colors.semantic.text.secondary }}>
              <li>Simple project setup</li>
              <li>Manual control</li>
              <li>Experienced teams</li>
            </ul>
          </div>

          <ButtonCore variant="secondary" fullWidth>
            Create Blank Project
          </ButtonCore>
        </Card>

        {/* Excel / existing-data Mode */}
        <Card
          style={{
            padding: '32px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            border: `2px solid ${colors.semantic.border.default}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = colors.warning[500];
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(245, 158, 11, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = colors.semantic.border.default;
            e.currentTarget.style.boxShadow = 'none';
          }}
          onClick={() => onSelectMode('excel')}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              background: colors.warning[100],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke={colors.warning[600]}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </div>

          <h3
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: colors.semantic.text.primary,
              marginBottom: '8px',
            }}
          >
            Create from existing data
          </h3>

          <p
            style={{
              fontSize: '14px',
              color: colors.semantic.text.secondary,
              lineHeight: 1.6,
              marginBottom: '20px',
            }}
          >
            Already have your tickets in a spreadsheet? Upload an Excel or CSV file and we&apos;ll
            create the project and import every row as a ticket — no re-typing.
          </p>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: colors.semantic.text.tertiary, marginBottom: '8px' }}>
              Best for:
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: colors.semantic.text.secondary }}>
              <li>Migrating from another tool</li>
              <li>An existing backlog in Excel/CSV</li>
              <li>Bulk-creating tickets fast</li>
            </ul>
          </div>

          <ButtonCore variant="secondary" fullWidth>
            Import a Spreadsheet
          </ButtonCore>
        </Card>
      </div>

      <div
        style={{
          marginTop: '40px',
          padding: '20px',
          background: colors.semantic.background.tertiary,
          borderRadius: '8px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: '13px', color: colors.semantic.text.secondary, margin: 0 }}>
          Start from scratch with a blank project, or bring an existing backlog in by
          importing an Excel or CSV spreadsheet.
        </p>
      </div>
    </div>
  );
};
