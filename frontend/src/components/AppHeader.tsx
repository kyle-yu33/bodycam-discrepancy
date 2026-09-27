"use client";
import Link from "next/link";
import { QueueMenu } from "@/components/review/Queue";
import { Logo } from "@/components/site/SiteHeader";
export function AppHeader({ title, children }: { title?: string; children?: React.ReactNode }) {
  return <header className="relative z-40 flex shrink-0 flex-wrap items-center gap-3 border-b border-hairline bg-canvas px-5 py-3">
    <Link href="/" className="flex items-center gap-2.5 font-serif text-xl font-semibold"><Logo />evidently</Link>
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm"><Link href="/cases" className="text-muted hover:text-ink">Cases</Link>{title && <><span aria-hidden className="text-muted">/</span><span className="max-w-48 truncate">{title}</span></>}</nav>
    <div className="ml-auto flex items-center gap-2">{children}<QueueMenu /><Link href="/new" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hi">New case</Link></div>
  </header>;
}
