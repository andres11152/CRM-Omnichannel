import React from "react";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = "", ...props }) => {
  return (
    <div
      className={`animate-pulse bg-slate-200 dark:bg-slate-700/50 rounded-md ${className}`}
      {...props}
    />
  );
};

export const PageSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col h-full w-full p-6 md:p-8 space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <Skeleton className="w-12 h-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      <Skeleton className="h-px w-full" />

      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 rounded-2xl border border-slate-100 dark:border-white/5 space-y-4">
            <div className="flex justify-between items-center">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <Skeleton className="h-4 w-12 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Content Area Skeleton */}
      <div className="flex-1 mt-4 space-y-4">
        <Skeleton className="h-12 w-full rounded-t-2xl" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
};
