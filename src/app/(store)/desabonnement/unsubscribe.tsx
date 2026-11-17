"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { useStoreBase } from "@/components/store/store-id";

/** Un clic pour confirmer (pas d'action automatique au chargement : les antivirus de messagerie ouvrent les liens). */
export function Unsubscribe({ c, t }: { c: string; t: string }) {
  const unsubscribe = useMutation(api.recovery.unsubscribe);
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const base = useStoreBase();
  return (
    <main className="mx-auto max-w-lg px-4 pt-12">
      <div className="rounded-[28px] bg-card p-8 text-center">
        {state === "done" ? (
          <>
            <h1 className="text-2xl font-bold">C&apos;est fait ✅</h1>
            <p className="mt-2 text-muted-foreground">Tu ne recevras plus de rappels de commande. Les emails liés à tes achats (accès aux produits) continueront d&apos;arriver.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Ne plus recevoir de rappels ?</h1>
            <p className="mt-2 text-muted-foreground">On t&apos;écrit seulement quand une commande n&apos;est pas allée au bout.</p>
            <button
              type="button"
              disabled={state === "pending" || !c || !t}
              onClick={async () => {
                setState("pending");
                const r = await unsubscribe({ c, t }).catch(() => ({ ok: false }));
                setState(r.ok ? "done" : "error");
              }}
              className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl bg-foreground px-6 font-semibold text-background disabled:opacity-60"
            >
              {state === "pending" && <Loader2 className="size-4 animate-spin" />} Me désabonner
            </button>
            {state === "error" && <p className="mt-3 text-sm text-destructive">Lien invalide ou expiré. Réponds simplement à l&apos;email pour qu&apos;on te retire de la liste.</p>}
          </>
        )}
        <Link href={`${base}/`} className="mt-6 block text-sm font-medium text-muted-foreground underline-offset-4 hover:underline">
          Retour à la boutique
        </Link>
      </div>
    </main>
  );
}
