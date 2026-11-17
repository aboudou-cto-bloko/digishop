"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, Lock, X } from "lucide-react";
import { BuyButton } from "./checkout-sheet";
import { track } from "@/lib/track";

type PreviewFile = { name: string; pages: number | null; previewUrl: string | null; previewPages: number };

/** Bouton « Aperçu » d'un fichier : ouvre la visionneuse des premières pages (PDF d'aperçu, jamais le fichier complet). */
export function FilePreviewButton({
  file,
  productId,
  ctaLabel,
  checkoutHref,
  base,
  preview,
}: {
  file: PreviewFile;
  productId: string;
  ctaLabel: string;
  checkoutHref: string;
  base?: string;
  preview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!file.previewUrl) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          track("preview_open", { productId, props: { file: file.name.slice(0, 120) } });
        }}
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 text-sm font-semibold hover:bg-surface"
      >
        <Eye className="size-4" /> Aperçu
      </button>
      {open && <PreviewModal file={file} ctaLabel={ctaLabel} checkoutHref={checkoutHref} base={base} preview={preview} onClose={() => setOpen(false)} />}
    </>
  );
}

function PreviewModal({ file, ctaLabel, checkoutHref, base, preview, onClose }: { file: PreviewFile; ctaLabel: string; checkoutHref: string; base?: string; preview?: boolean; onClose: () => void }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const title = file.name.replace(/\.[^.]+$/, "");
  const rest = file.pages ? file.pages - file.previewPages : 0;

  // Échap pour fermer + défilement de la page bloqué derrière la visionneuse
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Rendu page par page avec pdf.js (l'iframe PDF n'est pas fiable sur Android)
  useEffect(() => {
    let cancelled = false;
    const host = pagesRef.current;
    if (!host || !file.previewUrl) return;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ url: file.previewUrl! }).promise;
        const width = host.clientWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages && !cancelled; i++) {
          const page = await doc.getPage(i);
          const base1 = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base1.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "w-full rounded-xl bg-white shadow-sm";
          canvas.setAttribute("aria-label", `Page ${i}`);
          host.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
          if (i === 1 && !cancelled) setState("ready");
        }
        await doc.cleanup();
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [file.previewUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Aperçu : ${title}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface sm:rounded-3xl"
      >
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{title}</p>
            <p className="text-sm text-muted-foreground">
              Aperçu gratuit · {file.previewPages} page{file.previewPages > 1 ? "s" : ""}
              {file.pages ? ` sur ${file.pages}` : ""}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fermer l'aperçu" className="flex size-11 items-center justify-center rounded-xl hover:bg-surface">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
          {state === "loading" && <div className="mb-3 h-[60vh] animate-pulse rounded-xl bg-card" />}
          {state === "error" && <p className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground">Impossible d&apos;afficher l&apos;aperçu sur cet appareil.</p>}
          <div ref={pagesRef} className="space-y-3" />
          {rest > 0 && state !== "loading" && (
            <div className="mt-4 rounded-2xl bg-card p-5 text-center">
              <Lock className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 font-semibold">
                Encore {rest} page{rest > 1 ? "s" : ""} dans la version complète
              </p>
              <BuyButton href={`${base ?? ""}${checkoutHref}`} preview={preview} onBeforeOpen={onClose} className="mt-4 flex h-12 items-center justify-center rounded-2xl bg-brand font-bold text-brand-foreground hover:bg-brand-hover">
                {ctaLabel}
              </BuyButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
