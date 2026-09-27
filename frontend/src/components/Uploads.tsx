"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { createCase } from "@/lib/ledger";

type Transfer = { id: string; name: string; percent: number; source: string; caseId?: string; error?: string };
const Context = createContext<{ transfers: Transfer[]; start: (form: FormData) => void; dismiss: (id: string) => void; acknowledge: (ids: string[]) => void } | null>(null);
export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const acknowledge = useCallback((ids: string[]) => {
    setTransfers((items) => items.some((t) => t.caseId && ids.includes(t.caseId))
      ? items.filter((t) => !t.caseId || !ids.includes(t.caseId)) : items);
  }, []);
  const uploading = transfers.some((t) => !t.caseId && !t.error);
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);
  function start(form: FormData) {
    const id = crypto.randomUUID();
    const file = form.get("video");
    const source = file instanceof File ? file.name : "YouTube video";
    setTransfers((items) => [...items, { id, name: String(form.get("name") || source), source, percent: 0 }]);
    const update = (change: Partial<Transfer>) => setTransfers((items) => items.map((t) => t.id === id ? { ...t, ...change } : t));
    void createCase(form, (percent) => update({ percent })).then((job) => update({ caseId: job.id }))
      .catch((error: Error) => update({ error: error.message }));
  }
  return <Context.Provider value={{ transfers, start, acknowledge, dismiss: (id) => setTransfers((items) => items.filter((t) => t.id !== id)) }}>{children}</Context.Provider>;
}
export function useUploads() {
  const value = useContext(Context);
  if (!value) throw new Error("UploadProvider missing");
  return value;
}
export function Transfers({ knownIds = [] }: { knownIds?: string[] }) {
  const { transfers, dismiss } = useUploads();
  return <ul className="space-y-3">{transfers.filter((t) => !t.caseId || !knownIds.includes(t.caseId)).map((t) => <li key={t.id} className="rounded-lg border border-hairline p-3 text-sm">
    <p className="break-words font-medium">{t.name}</p>
    {t.error ? <><p role="alert" className="mt-1 text-review">{t.error}</p><Link href="/new" className="mr-3 underline">Try another upload</Link><button onClick={() => dismiss(t.id)} className="underline">Dismiss</button></>
      : t.caseId ? <Link href={`/cases/${encodeURIComponent(t.caseId)}`} className="text-brand underline">Upload received · open case</Link>
      : <><p className="mt-1 text-muted">{t.percent === 100 ? "Upload received; preparing the case…" : `Uploading · ${t.percent}%`}</p><progress aria-label={`Uploading ${t.name}`} className="mt-2 w-full" value={t.percent} max={100} /><p className="mt-1 text-xs text-muted">You can browse other pages. Keep this browser tab open until the upload finishes.</p></>}
  </li>)}</ul>;
}
