import React from 'react';
import { Plus } from 'lucide-react';
import { ButtonCore } from '@/components/ui';
import { EpicIcon } from '@/components/icons/EpicIcon';

interface EpicsEmptyStateProps {
  hasFilters: boolean;
  onCreate: () => void;
}

export function EpicsEmptyState({ hasFilters, onCreate }: EpicsEmptyStateProps) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '64px 24px',
        backgroundColor: '#FFFFFF',
        border: '1px solid #DFE1E6',
        borderRadius: 3,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          margin: '0 auto 16px',
          borderRadius: 3,
          backgroundColor: '#DEEBFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <EpicIcon size={24} color="#0052CC" />
      </div>
      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: '#172B4D',
          margin: 0,
          marginBottom: 6,
        }}
      >
        {hasFilters ? 'No epics found' : 'No epics yet'}
      </h3>
      <p
        style={{
          fontSize: 13,
          color: '#5E6C84',
          margin: 0,
          marginBottom: 16,
          maxWidth: 420,
          marginLeft: 'auto',
          marginRight: 'auto',
          lineHeight: 1.5,
        }}
      >
        {hasFilters
          ? 'Try adjusting your search or filters to find what you\'re looking for.'
          : 'Create your first epic to organize related work into larger features and strategic initiatives.'}
      </p>
      {!hasFilters && (
        <ButtonCore variant="primary" onClick={onCreate} leftIcon={<Plus size={14} />}>
          Create your first epic
        </ButtonCore>
      )}
    </div>
  );
}
