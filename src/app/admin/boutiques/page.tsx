"use client";

import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useState } from "react";
import { Check, ExternalLink, Globe, Loader2, Pause, Play, Plus, Store, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import { Money } from "@/components/admin/ui";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStore, type StoreRow } from "@/hooks/use-current-store";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
const PATH_MODE = process.env.NEXT_PUBLIC_STORE_ROUTING === "path";
/** Adresse affichée d'une boutique selon le mode d'adressage. */
const addressOf = (slug: string) => (PATH_MODE ? `${ROOT}/b/${slug}` : `${slug}.${ROOT}`);

export default function StoresPage() {
  return (
    <Suspense>
      <Stores />
    </Suspense>
  );
}

function Stores() {
  const { stores, store: current, select } = useCurrentStore();
  const full = useQuery(api.stores.list);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const creating = params.get("nouveau") === "1";
  const setCreating = (o: boolean) => router.replace(o ? `${pathname}?nouveau=1` : pathname, { scroll: false });
  const [domainFor, setDomainFor] = useState<StoreRow | null>(null);
  const rows = full ?? stores;
  const total = rows.reduce((a, s) => a + s.revenue, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-heading text-4xl">Mes boutiques</h1>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-brand-foreground hover:bg-brand-hover">
          <Plus className="size-5" /> Créer une boutique
        </button>
      </div>
      <p className="mb-6 text-[0.95rem] text-muted-foreground">
        Toutes tes boutiques partagent ton compte Moneroo. Chaque boutique a ses produits, ses clients, sa vitrine, son pixel et ses retraits. Revenu cumulé : <Money value={total} className="font-semibold text-foreground" />.
      </p>

      <div className="space-y-3">
        {rows.map((s) => (
          <div key={s._id} className={cn("rounded-3xl border p-4 sm:p-5", s._id === current._id ? "border-foreground" : "border-border")}>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-foreground text-background">
                {s.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.logoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Store className="size-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-lg font-bold">{s.name}</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      s.status === "active" ? "bg-[var(--success-bg)] text-[var(--success-fg)]" : "bg-[#fef3c7] text-[#92400e]",
                    )}
                  >
                    {s.status === "active" ? <Check className="size-3" /> : <Pause className="size-3" />} {s.status === "active" ? "En ligne" : "En pause"}
                  </span>
                  {s._id === current._id && <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-semibold">Boutique ouverte dans le dashboard</span>}
                </div>
                <a href={s.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  {s.url.replace(/^https?:\/\//, "")} <ExternalLink className="size-3.5" />
                </a>
              </div>
              <div className="flex gap-6 text-right">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground">Ventes 30 j</div>
                  <div className="text-lg font-bold">{s.sales30}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground">Revenu</div>
                  <Money value={s.revenue} className="text-lg font-bold" />
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              {s._id !== current._id && (
                <button type="button" onClick={() => select(s.slug)} className="inline-flex h-11 items-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background">
                  Ouvrir dans le dashboard
                </button>
              )}
              <StatusButton s={s} />
              <button type="button" onClick={() => setDomainFor(s)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold hover:bg-[#eceeec]">
                <Globe className="size-4" /> {s.customDomain ? "Changer le domaine" : "Domaine personnalisé"}
              </button>
            </div>
          </div>
        ))}
        {!full && <Skeleton className="h-28 rounded-3xl" />}
      </div>

      <CreateStore open={creating} onOpenChange={setCreating} onCreated={(slug) => select(slug, "/admin/produits?nouveau=1")} />
      <DomainDialog store={domainFor} onClose={() => setDomainFor(null)} />
    </div>
  );
}

function StatusButton({ s }: { s: StoreRow }) {
  const update = useMutation(api.stores.update);
  const [busy, setBusy] = useState(false);
  const active = s.status === "active";
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await update({ storeId: s._id, status: active ? "paused" : "active" });
          toast.success(active ? "Boutique mise en pause : la vitrine affiche « Bientôt ouverte »." : "Boutique en ligne 🎉");
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold hover:bg-[#eceeec] disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : active ? <Pause className="size-4" /> : <Play className="size-4" />}
      {active ? "Mettre en pause" : "Mettre en ligne"}
    </button>
  );
}

function CreateStore({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (slug: string) => void }) {
  const create = useMutation(api.stores.create);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const candidate = useDeferredValue(touched ? slug : name);
  const check = useQuery(api.stores.slugAvailable, candidate.trim().length >= 3 ? { slug: candidate } : "skip");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!check?.ok) return;
    setPending(true);
    try {
      await create({ name, slug: check.slug });
      toast.success("Boutique créée : ajoute un produit puis mets-la en ligne.");
      onOpenChange(false);
      setName("");
      setSlug("");
      setTouched(false);
      onCreated(check.slug);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-3xl p-6 sm:max-w-md">
        <DialogTitle className="font-heading text-2xl font-normal">Nouvelle boutique</DialogTitle>
        <p className="-mt-2 text-sm text-muted-foreground">Elle utilisera ton compte Moneroo. Tu pourras régler sa vitrine, ses marchés et son pixel séparément.</p>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-2">
            <span className="font-semibold">Nom</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Guides Agricoles BJ" required className="h-12 w-full rounded-xl border border-border px-4 text-base" />
          </label>
          <label className="block space-y-2">
            <span className="font-semibold">Adresse</span>
            <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border focus-within:ring-2 focus-within:ring-foreground/10">
              {PATH_MODE && <span className="flex h-full shrink-0 items-center bg-surface px-3 text-sm text-muted-foreground">{ROOT}/b/</span>}
              <input
                value={touched ? slug : (check?.slug ?? "")}
                onChange={(e) => {
                  setTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                }}
                placeholder="guides-agricoles"
                className="h-full min-w-0 flex-1 px-4 text-base outline-none"
              />
              {!PATH_MODE && <span className="flex h-full shrink-0 items-center bg-surface px-3 text-sm text-muted-foreground">.{ROOT}</span>}
            </div>
            {check && (
              <span className={cn("flex items-center gap-1.5 text-sm font-medium", check.ok ? "text-[var(--success-fg)]" : "text-destructive")}>
                {check.ok ? <Check className="size-4" /> : <X className="size-4" />} {check.ok ? `${addressOf(check.slug)} est disponible` : check.reason}
              </span>
            )}
          </label>
          <button type="submit" disabled={pending || !check?.ok || !name.trim()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-brand-foreground disabled:opacity-50">
            {pending && <Loader2 className="size-4 animate-spin" />} Créer la boutique
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DomainDialog({ store, onClose }: { store: StoreRow | null; onClose: () => void }) {
  const update = useMutation(api.stores.update);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if (store && store._id !== lastId) {
    setLastId(store._id);
    setValue(store.customDomain ?? "");
  }
  const save = async (domain: string | null) => {
    if (!store) return;
    setPending(true);
    try {
      await update({ storeId: store._id, customDomain: domain });
      toast.success(domain ? "Domaine enregistré" : "Domaine retiré");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={Boolean(store)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-3xl p-6 sm:max-w-md">
        <DialogTitle className="font-heading text-2xl font-normal">Domaine personnalisé</DialogTitle>
        <p className="-mt-2 text-sm text-muted-foreground">Par défaut : {store ? addressOf(store.slug) : ""}. Tu peux utiliser ton propre nom de domaine.</p>
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="boutique.mondomaine.com" className="h-12 w-full rounded-xl border border-border px-4 text-base" />
        <div className="rounded-2xl bg-surface p-4 text-sm">
          <p className="font-semibold">Chez ton fournisseur de domaine, ajoute :</p>
          <p className="mt-2 font-mono text-xs">
            CNAME · {value.split(".")[0] || "boutique"} → cname.vercel-dns.com
          </p>
          <p className="mt-2 text-muted-foreground">Le domaine devra aussi être ajouté au projet Vercel au moment de la mise en ligne.</p>
        </div>
        <div className="flex gap-2">
          {store?.customDomain && (
            <button type="button" onClick={() => save(null)} disabled={pending} className="h-12 rounded-xl px-4 font-semibold text-destructive">
              Retirer
            </button>
          )}
          <button type="button" onClick={() => save(value)} disabled={pending || !value.trim()} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-foreground font-semibold text-background disabled:opacity-50">
            {pending && <Loader2 className="size-4 animate-spin" />} Enregistrer
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
