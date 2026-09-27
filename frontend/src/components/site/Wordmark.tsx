"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

function Logo() {
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

/** Logo and name, identical in every header: on the home page it scrolls back to the top, elsewhere it goes home. */
export function Wordmark() {
  const home = usePathname() === "/";
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5"
      onClick={(e) => { if (home) { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); } }}>
      <Logo />
      <span className="font-serif text-[21px] font-semibold tracking-tight text-ink">evidently</span>
    </Link>
  );
}
