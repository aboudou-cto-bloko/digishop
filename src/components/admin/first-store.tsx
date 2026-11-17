"use client";

import { useMutation, useQuery } from "convex/react";
import { useDeferredValue, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { LogoMark } from "@/components/shared/logo";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROUTING = process.env.NEXT_PUBLIC_STORE_ROUTING === "path" ? "path" : "subdomain";
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

/** Premier lancement (base vide) : création de la première boutique. */
export function FirstStore() {
  const create = useMutation(api.stores.create);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const candidate = useDeferredValue(name);
  const check = useQuery(api.stores.slugAvailable, candidate.trim().length >= 3 ? { slug: candidate } : "skip");
  const preview = check ? (ROUTING === "path" ? `${ROOT}/b/${check.slug}` : `${check.slug}.${ROOT}`) : "";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <LogoMark className="size-12" />
        </div>
        <div className="rounded-3xl bg-card p-6 sm:p-8">
          <h1 className="font-heading text-3xl">Crée ta première boutique</h1>
          <p className="mt-1.5 text-[0.95rem] text-muted-foreground">Un nom suffit : tu régleras la vitrine, les produits et les paiements juste après.</p>
          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!check?.ok) return;
              setPending(true);
              try {
                await create({ name, slug: check.slug });
                toast.success("Boutique créée 🎉");
              } catch (err) {
                toast.error(errorMessage(err));
                setPending(false);
              }
            }}
          >
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Mon Espace Digital" className="h-12 w-full rounded-xl bg-surface px-4 text-base outline-none focus:ring-2 focus:ring-foreground/10" />
            {check && (
              <p className={cn("flex items-center gap-1.5 text-sm font-medium", check.ok ? "text-[var(--success-fg)]" : "text-destructive")}>
                {check.ok ? <Check className="size-4" /> : <X className="size-4" />} {check.ok ? preview : check.reason}
              </p>
            )}
            <button type="submit" disabled={pending || !check?.ok} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-brand-foreground disabled:opacity-50">
              {pending && <Loader2 className="size-4 animate-spin" />} Créer ma boutique
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
