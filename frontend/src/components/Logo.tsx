export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--brand)" />
      <g fill="none" stroke="var(--bg)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 46c-6-5-9-11-9-17 0-4 3-8 9-12 6 4 9 8 9 12 0 6-3 12-9 17Z" />
        <path d="M32 46c-7 0-15-3-19-10 4-2 9-2 13 0M32 46c7 0 15-3 19-10-4-2-9-2-13 0" />
      </g>
    </svg>
  );
}
