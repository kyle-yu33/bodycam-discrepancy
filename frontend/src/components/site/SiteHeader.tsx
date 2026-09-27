import type { ReactNode } from "react";
import { ShieldCheck } from "@/components/review/Icons";
import { Wordmark } from "@/components/site/Wordmark";

/** Top bar for the pages around the review workspace (home, new case): wordmark, where you are, page actions. */
export function SiteHeader({ context, children }: { context?: string; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Wordmark />
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
