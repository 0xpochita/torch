"use client";

import { API_URL } from "@/lib/api";

/** Grey placeholder block while an API read is in flight. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-[20px] bg-fill ${className}`} />;
}

/** Read failed: says what and where, offers a reload. */
export function ErrorState({ error, className = "" }: { error: Error; className?: string }) {
  return (
    <div role="alert" className={`grid place-items-center gap-2 p-10 text-center ${className}`}>
      <span className="title-chunky text-[24px]">Couldn&apos;t load data</span>
      <span className="max-w-sm text-[14px] text-muted">
        {error.message}. Is the API running at <span className="font-mono">{API_URL}</span>?
      </span>
      <button onClick={() => location.reload()} className="btn-line mt-1 h-9 px-4 text-[13px]">
        Retry
      </button>
    </div>
  );
}

/** Nothing indexed yet (fresh testnet). */
export function EmptyState({ title, body, className = "", children }: { title: string; body: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={`grid place-items-center gap-2 p-10 text-center ${className}`}>
      <span className="title-chunky text-[26px]">{title}</span>
      <span className="max-w-sm text-[15px] text-muted">{body}</span>
      {children}
    </div>
  );
}
