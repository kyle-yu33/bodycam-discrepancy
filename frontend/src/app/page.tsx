"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listCases } from "@/lib/ledger";

// Opens the demo case: NEXT_PUBLIC_DEFAULT_CASE if it exists, else sfst2, else the first cached case.
const PREFERRED = process.env.NEXT_PUBLIC_DEFAULT_CASE ?? "sfst2";

export default function Home() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    listCases()
      .then((cases) => {
        if (!cases.length) throw new Error("No analyzed cases yet. From backend/, run: python -m app.cases sfst2");
        const id = cases.some((c) => c.case === PREFERRED) ? PREFERRED : cases[0].case;
        router.replace(`/cases/${id}${window.location.search}`);
      })
      .catch((e: Error) => setError(e.message));
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="font-serif text-3xl font-semibold tracking-tight text-ink">EvidenceLens</p>
        <p className="mt-3 text-sm leading-6 text-muted">{error || "Opening the case…"}</p>
        {error && (
          <button onClick={() => location.reload()} className="mt-5 inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-hi">
            Try again
          </button>
        )}
      </div>
    </main>
  );
}
