export function StatusIcon({ className = "", size = 16 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2ZM8 3.33333C10.5775 3.33333 12.6667 5.42254 12.6667 8C12.6667 10.5775 10.5775 12.6667 8 12.6667C5.42254 12.6667 3.33333 10.5775 3.33333 8C3.33333 5.42254 5.42254 3.33333 8 3.33333ZM7.33333 4.66667V8.47107L10.1953 11.3333L11.1381 10.3905L8.66667 7.91904V4.66667H7.33333Z"
        fill="currentColor"
      />
    </svg>
  );
}
