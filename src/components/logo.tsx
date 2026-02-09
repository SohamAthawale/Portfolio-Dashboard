type LogoProps = {
  className?: string;
  compact?: boolean;
};

const Logo = ({ className = "", compact = false }: LogoProps) => {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <svg
        viewBox="0 0 72 72"
        className="h-11 w-11 shrink-0"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="folioPulse" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="64" height="64" rx="18" fill="#0f172a" />
        <path
          d="M18 45 L28 34 L37 39 L50 24"
          fill="none"
          stroke="url(#folioPulse)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="24" r="4" fill="#22d3ee" />
      </svg>
      <div className="leading-tight">
        <p className="text-xl font-black tracking-tight text-slate-900">FolioPulse</p>
        {!compact && (
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
            Portfolio Tracker
          </p>
        )}
      </div>
    </div>
  );
};

export default Logo;
