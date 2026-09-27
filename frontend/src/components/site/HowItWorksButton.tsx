"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HowItWorks } from "@/components/review/Chrome";

// The workspace's "How it works" drawer, opened from the home page's header. It is portalled to <body>: the
// header's backdrop blur would otherwise become the containing block for the drawer's fixed positioning.
export function HowItWorksButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button onClick={() => setOpen(true)} aria-haspopup="dialog" className={className}>How it works</button>
      {open && createPortal(<HowItWorks open onClose={() => setOpen(false)} keyboard={false} />, document.body)}
    </>
  );
}
