export function ReleaseIcon({ className = "", size = 16 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M8 2L9.5 5.5L13.5 6L10.5 8.5L11.5 12.5L8 10.5L4.5 12.5L5.5 8.5L2.5 6L6.5 5.5L8 2Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      <path
        d="M3 14H13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
