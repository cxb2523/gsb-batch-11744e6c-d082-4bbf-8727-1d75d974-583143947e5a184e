import { ImageResponse } from 'next/og';

// Image metadata
export const size = {
  width: 32,
  height: 32,
};
export const contentType = 'image/png';

// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2563EB',
          borderRadius: '6px',
        }}
      >
        {/* Simplified grid icon for favicon */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          {/* Top row */}
          <div style={{ display: 'flex', gap: '2px' }}>
            <div style={{ width: '6px', height: '6px', background: 'rgba(255,255,255,0.9)', borderRadius: '1px' }} />
            <div style={{ width: '6px', height: '6px', background: 'rgba(255,255,255,0.6)', borderRadius: '1px' }} />
            <div style={{ width: '6px', height: '6px', background: 'rgba(255,255,255,0.4)', borderRadius: '1px' }} />
          </div>
          {/* Middle row */}
          <div style={{ display: 'flex', gap: '2px' }}>
            <div style={{ width: '6px', height: '6px', background: 'rgba(255,255,255,0.6)', borderRadius: '1px' }} />
            <div style={{ width: '6px', height: '6px', background: '#10B981', borderRadius: '1px' }} />
            <div style={{ width: '6px', height: '6px', background: 'rgba(255,255,255,0.4)', borderRadius: '1px' }} />
          </div>
          {/* Bottom row */}
          <div style={{ display: 'flex', gap: '2px' }}>
            <div style={{ width: '6px', height: '6px', background: 'rgba(255,255,255,0.4)', borderRadius: '1px' }} />
            <div style={{ width: '6px', height: '6px', background: 'rgba(255,255,255,0.6)', borderRadius: '1px' }} />
            <div style={{ width: '6px', height: '6px', background: 'rgba(255,255,255,0.9)', borderRadius: '1px' }} />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
