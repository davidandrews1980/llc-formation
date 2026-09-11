export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="16" cy="16" r="12.25" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M7.5 20.5c3.6-7.2 7.2.6 13.2-6.4 1.6-1.8 3.4-2.6 4.8-2.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="2.1" fill="currentColor" />
    </svg>
  );
}
