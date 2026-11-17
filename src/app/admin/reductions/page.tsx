"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BadgePercent, Copy, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { EmptyState } from "@/components/admin/ui";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, fcfa, fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStoreQuery, useStoreMutation } from "@/hooks/use-current-store";

export default function CouponsPage() {
  return (
    <Suspense>
      <Coupons />
    </Suspense>
  );
}

function Coupons() {
  const all = useStoreQuery(api.coupons.list, {});
  // Les codes uniques générés par les relances sont gérés depuis Automatisations
  const rows = all?.filter((c) => !c.saleId);
  const generated = all ? all.length - (rows?.length ?? 0) : 0;
  const toggle = useStoreMutation(api.coupons.toggle);
  const remove = useStoreMutation(api.coupons.remove);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [now] = useState(() => Date.now());
  const creating = params.get("nouveau") === "1";
  const setCreating = (o: boolean) => router.replace(o ? `${pathname}?nouveau=1` : pathname, { scroll: false });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-center gap-3">
        <h1 className="flex-1 text-[1.75rem] font-bold">Réductions</h1>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex h-12 items-center rounded-xl bg-brand px-5 font-semibold hover:bg-brand-hover">
          Créer une réduction
        </button>
      </div>

      {rows === undefined && <Skeleton className="h-32 w-full rounded-3xl" />}
      {generated > 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          + {generated} code{generated > 1 ? "s" : ""} unique{generated > 1 ? "s" : ""} généré{generated > 1 ? "s" : ""} automatiquement par les relances (voir Automatisations).
        </p>
      )}
      {rows?.length === 0 && (
        <EmptyState
          icon={<BadgePercent />}
          title="Aucun code promo"
          text="Crée un code (ex. LANCEMENT) à partager en story ou dans un groupe WhatsApp : tes clients le saisissent au paiement."
        />
      )}
      <div className="space-y-3">
        {rows?.map((c) => {
          const expired = c.expiresAt !== undefined && c.expiresAt < now;
          const full = c.maxUses !== undefined && c.uses >= c.maxUses;
          return (
            <div key={c._id} className={cn("flex flex-wrap items-center gap-4 rounded-3xl border border-border p-4 sm:p-5", (!c.active || expired || full) && "opacity-60")}>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(c.code).then(() => toast.success("Code copié"))}
                className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-dashed border-foreground/30 px-4 font-mono text-[0.95rem] font-bold tracking-wide"
              >
                {c.code} <Copy className="size-4 text-muted-foreground" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {c.type === "percent" ? `-${c.value} %` : `-${fcfa(c.value)}`} {c.productTitle ? `sur ${c.productTitle}` : "sur tous les produits"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {c.uses} utilisation{c.uses > 1 ? "s" : ""}
                  {c.maxUses !== undefined && ` / ${c.maxUses}`}
                  {c.expiresAt && ` · ${expired ? "expiré le" : "expire le"} ${fmtDate(c.expiresAt)}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={c.active} onCheckedChange={(v) => toggle({ id: c._id, active: v })} aria-label="Activer le code" />
                <button
                  type="button"
                  onClick={() => window.confirm(`Supprimer le code ${c.code} ?`) && remove({ id: c._id })}
                  className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-destructive"
                  aria-label="Supprimer"
                >
                  <Trash2 className="size-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <CreateCoupon open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function CreateCoupon({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useStoreMutation(api.coupons.create);
  const products = useStoreQuery(api.products.adminList, open ? {} : "skip");
  const [code, setCode] = useState("");
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expires, setExpires] = useState("");
  const [productId, setProductId] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      await create({
        code,
        type,
        value: Number(value),
        maxUses: maxUses ? Number(maxUses) : undefined,
        expiresAt: expires ? new Date(`${expires}T23:59:59+01:00`).getTime() : undefined,
        productId: productId ? (productId as Id<"products">) : undefined,
      });
      toast.success("Code promo créé");
      setCode("");
      setValue("");
      setMaxUses("");
      setExpires("");
      setProductId("");
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const field = "h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus:ring-2 focus:ring-foreground/10";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-[calc(100%-2rem)] overflow-y-auto rounded-3xl p-6 sm:max-w-md">
        <DialogTitle className="font-heading text-2xl font-normal">Nouvelle réduction</DialogTitle>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-2">
            <span className="font-semibold">Code</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="LANCEMENT" required className={cn(field, "font-mono uppercase")} />
          </label>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-1">
            {(["percent", "fixed"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} className={cn("h-11 rounded-lg font-semibold", type === t ? "bg-card shadow-sm" : "text-muted-foreground")}>
                {t === "percent" ? "Pourcentage" : "Montant fixe"}
              </button>
            ))}
          </div>
          <label className="block space-y-2">
            <span className="font-semibold">{type === "percent" ? "Réduction (%)" : "Réduction (F CFA)"}</span>
            <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} required placeholder={type === "percent" ? "20" : "500"} className={field} />
          </label>
          <label className="block space-y-2">
            <span className="font-semibold">Produit concerné</span>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className={field}>
              <option value="">Tous les produits</option>
              {products?.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-2">
              <span className="font-semibold">Limite d&apos;usage</span>
              <input inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} placeholder="Illimité" className={field} />
            </label>
            <label className="block space-y-2">
              <span className="font-semibold">Expire le</span>
              <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={field} />
            </label>
          </div>
          {value && type === "fixed" && (
            <p className="text-sm text-muted-foreground">
              Le client paiera {fcfa(Number(value))} de moins.
            </p>
          )}
          <button type="submit" disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold disabled:opacity-60">
            {pending && <Loader2 className="size-4 animate-spin" />} Créer le code
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
