import React from "react";

type LoadingStateProps = {
  cards?: number;
  lines?: number;
  compact?: boolean;
};

/**
 * Mobile-friendly skeleton loader to keep layout stable while data loads.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  cards = 3,
  lines = 3,
  compact = false,
}) => {
  const cardArray = Array.from({ length: cards });
  const lineArray = Array.from({ length: lines });

  return (
    <div className="space-y-4 sm:space-y-6">
      {cardArray.map((_, idx) => (
        <div
          key={idx}
          className="app-panel p-4 sm:p-5 animate-pulse space-y-3 sm:space-y-4"
        >
          <div className="h-5 w-32 bg-slate-200 rounded" />
          {!compact && <div className="h-6 w-44 bg-slate-200 rounded" />}
          <div className="space-y-2">
            {lineArray.map((__, i) => (
              <div
                key={i}
                className="h-3 bg-slate-200 rounded"
                style={{ width: `${80 - i * 10}%` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default LoadingState;
