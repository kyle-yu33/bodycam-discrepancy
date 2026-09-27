"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CaseSummary } from "@/lib/ledger";
import { caseMeta } from "@/lib/present";

// Closing a tab only hides it in this browser; the case stays on disk and can be reopened from the menu.
const KEY = "evidencelens.closedCases";
const CHANGE = "evidencelens:closed-cases";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(CHANGE, onChange); };
}

function useClosedCases() {
  const raw = useSyncExternalStore(subscribe, () => localStorage.getItem(KEY) ?? "[]", () => "[]");
  const closed = useMemo(() => {
    try { return new Set<string>(JSON.parse(raw)); } catch { return new Set<string>(); }
  }, [raw]);
  const write = (next: Set<string>) => {
    localStorage.setItem(KEY, JSON.stringify([...next]));
    window.dispatchEvent(new Event(CHANGE));
  };
  return {
    closed,
    close: (id: string) => write(new Set([...closed, id])),
    reopen: (id: string) => write(new Set([...closed].filter((x) => x !== id))),
  };
}

export function CaseTabs({ caseId, cases }: { caseId: string; cases: CaseSummary[] }) {
  const router = useRouter();
  const { closed, close, reopen } = useClosedCases();
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  // Demo cases are always shown; uploads can be closed. The case being viewed stays until you leave it.
  const isOpen = (c: CaseSummary) => c.origin !== "upload" || !closed.has(c.case) || c.case === caseId;
  const open = cases.filter(isOpen);
  const hidden = cases.filter((c) => !isOpen(c));

  function closeTab(id: string) {
    close(id);
    if (id === caseId) {
      const next = open.find((c) => c.case !== id);
      router.push(next ? `/cases/${encodeURIComponent(next.case)}` : "/new");
    }
  }

  function reopenTab(id: string) {
    reopen(id);
    setMenu(false);
    router.push(`/cases/${encodeURIComponent(id)}`);
  }

  const tabs = cases.length ? open : [{ case: caseId, origin: "demo" } as CaseSummary];

  return (
    <>
      <nav className="flex h-full min-w-0 items-stretch gap-5 overflow-x-auto border-l border-hairline pl-4 sm:pl-6" aria-label="Matters">
        {tabs.map((c) => {
          const current = c.case === caseId;
          return (
            <span key={c.case} className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 text-sm transition-colors ${current ? "border-brass font-medium text-ink" : "border-transparent text-muted hover:border-brass/45 hover:text-ink"}`}>
              <Link href={`/cases/${encodeURIComponent(c.case)}`} aria-current={current ? "page" : undefined}
                className="rounded-sm px-0.5 transition-colors hover:text-ink">
                {caseMeta(c.case).title}
              </Link>
              {c.origin === "upload" && (
                <button onClick={() => closeTab(c.case)} aria-label={`Close ${c.case} tab`} title="Close tab (the case is kept)"
                  className="rounded px-1 leading-none text-muted transition-colors hover:bg-hairline hover:text-ink">×</button>
              )}
            </span>
          );
        })}
      </nav>
      {hidden.length > 0 && (
        <div ref={box} className="relative z-50 shrink-0">
          <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu"
            className={`inline-flex h-9 items-center whitespace-nowrap rounded-md px-2.5 text-sm transition-colors ${menu ? "bg-hairline text-ink" : "text-muted hover:bg-hairline hover:text-ink"}`}>
            {hidden.length} closed ▾
          </button>
          {menu && (
            <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border border-hairline bg-raised p-2 shadow-2xl">
              <p className="px-2 pb-1 pt-0.5 text-xs text-muted">Closed uploads. Open one to bring its tab back.</p>
              {hidden.map((c) => (
                <button key={c.case} role="menuitem" onClick={() => reopenTab(c.case)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm text-ink-2 transition-colors hover:bg-hairline hover:text-ink">
                  <span className="truncate">{caseMeta(c.case).title}</span>
                  <span className="shrink-0 text-xs text-muted">{c.claims} claims</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
