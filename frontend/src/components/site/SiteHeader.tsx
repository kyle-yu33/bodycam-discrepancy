import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck } from "@/components/review/Icons";

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      <rect width="32" height="32" rx="7" className="fill-brand" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="6.5" fill="none" stroke="rgb(201 164 92 / 0.45)" />
      <circle cx="14.5" cy="14.5" r="6" fill="none" stroke="#f2ebe3" strokeWidth="2.2" />
      <path d="M19 19l5.5 5.5" stroke="#f2ebe3" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11.8 14.5h5.4" className="stroke-brass" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Top bar for the pages around the review workspace (home, new case): wordmark, where you are, page actions. */
export function SiteHeader({ context, children }: { context?: string; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Logo />
          <span className="font-serif text-[21px] font-semibold tracking-tight text-ink">evidently</span>
        </Link>
        {context && <span className="hidden text-sm text-muted sm:inline" aria-hidden>/</span>}
        {context && <span className="hidden text-sm text-muted sm:inline">{context}</span>}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">{children}</div>
      </div>
    </header>
  );
}

export function ReviewPill() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-brass/10 px-2 py-0.5 text-xs font-medium text-brass ring-1 ring-inset ring-brass/25">
      <ShieldCheck className="h-3.5 w-3.5" /> Human review required
    </span>
  );
}
