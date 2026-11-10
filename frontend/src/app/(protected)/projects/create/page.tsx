'use client';

import React, { useState, useEffect } from 'react';
import { ModeSelection } from '@/components/project-creation/ModeSelection';
import { BlankProjectForm } from '@/components/project-creation/BlankProjectForm';
import { SpreadsheetImport } from '@/components/project-creation/SpreadsheetImport';

type WizardStep = 'mode' | 'blank' | 'excel';

export default function ProjectCreationPage() {
  const [step, setStep] = useState<WizardStep>('mode');

  // Each step swaps in a different view; reset scroll so the new one starts at the
  // top instead of inheriting the previous step's position. The real scroll
  // container is the layout's <main> (overflow:auto), not the window.
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [step]);

  const handleModeSelection = (mode: 'blank' | 'excel') => {
    setStep(mode);
  };

  const handleBack = () => {
    setStep('mode');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FFFFFF' }}>
      {step === 'mode' && <ModeSelection onSelectMode={handleModeSelection} />}

      {step === 'blank' && <BlankProjectForm onBack={handleBack} />}

      {step === 'excel' && <SpreadsheetImport onBack={handleBack} />}
    </div>
  );
}
