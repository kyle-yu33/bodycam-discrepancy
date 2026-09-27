"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

type Confirmation = { title: string; description: string; action: string };
type Confirm = (options: Confirmation) => Promise<boolean>;
const ConfirmContext = createContext<Confirm | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Confirmation | null>(null);
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const confirm = useCallback<Confirm>((options) => {
    // A second trigger must not replace the action already being confirmed.
    if (resolve.current) return Promise.resolve(false);
    return new Promise<boolean>((done) => {
      resolve.current = done;
      setRequest(options);
    });
  }, []);

  const finish = useCallback((confirmed: boolean) => {
    const done = resolve.current;
    resolve.current = null;
    dialog.current?.close();
    setRequest(null);
    done?.(confirmed);
  }, []);

  useEffect(() => {
    if (request && !dialog.current?.open) {
      dialog.current?.showModal();
      cancel.current?.focus();
    }
  }, [request]);

  useEffect(() => () => { resolve.current?.(false); resolve.current = null; }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId}
        onCancel={(event) => { event.preventDefault(); finish(false); }}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-hairline bg-raised p-6 text-ink shadow-2xl backdrop:bg-black/60">
        <h2 id={titleId} className="font-serif text-2xl font-semibold">{request?.title}</h2>
        <p id={descriptionId} className="mt-3 break-words text-sm leading-relaxed text-muted">{request?.description}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button ref={cancel} type="button" onClick={() => finish(false)}
            className="rounded-lg border border-hairline px-4 py-2 text-sm hover:bg-hairline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Cancel</button>
          <button type="button" onClick={() => finish(true)}
            className="rounded-lg border border-review/40 bg-review-bg px-4 py-2 text-sm font-medium text-review hover:border-review hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-review">{request?.action}</button>
        </div>
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm requires ConfirmProvider");
  return confirm;
}
