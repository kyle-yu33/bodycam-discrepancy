"use client";
import Link from "next/link";
import { QueueMenu } from "@/components/review/Queue";
import { Wordmark } from "@/components/site/Wordmark";
export function AppHeader({ title, children }: { title?: string; children?: React.ReactNode }) {
  return <header className="relative z-40 flex shrink-0 flex-wrap items-center gap-3 border-b border-hairline bg-canvas px-5 py-3">
    <Wordmark />
    {title && <div className="flex min-w-0 items-center gap-2 text-sm"><span aria-hidden className="text-muted">/</span><span className="max-w-48 truncate">{title}</span></div>}
    <div className="ml-auto flex items-center gap-2">{children}<AppActions /></div>
  </header>;
}

/** Queue and New case, the actions shared by every page past the home page. */
export function AppActions() {
  return <><QueueMenu /><Link href="/new" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hi">New case</Link></>;
}
