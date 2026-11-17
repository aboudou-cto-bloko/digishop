"use client";

import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { FileText, Search, ShoppingBag, Settings } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NAV } from "./nav";
import { Thumb } from "./ui";
import { useStoreQuery } from "@/hooks/use-current-store";

/** Recherche globale ⌘K : pages, produits, ventes (client, email, n° de vente). */
export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());
  const products = useStoreQuery(api.products.adminList, open && deferred ? { search: deferred } : "skip");
  const sales = useStoreQuery(api.sales.list, open && deferred.length >= 2 ? { search: deferred, limit: 5 } : "skip");

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };
  const pages = [...NAV, { href: "/admin/pages", label: "Pages de contenu (CGV, mentions légales…)", icon: FileText }, { href: "/admin/parametres", label: "Paramètres", icon: Settings }].filter((p) =>
    p.label.toLowerCase().includes(deferred.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[12%] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Recherche</DialogTitle>
        <div className="flex h-14 items-center gap-3 border-b border-border px-4">
          <Search className="size-5 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Un produit, un client, un n° de vente…"
            className="h-full flex-1 bg-transparent text-base outline-none"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {pages.length > 0 && <Group label="Pages" />}
          {pages.map(({ href, label, icon: Icon }) => (
            <Row key={href} onClick={() => go(href)}>
              <Icon className="size-5 stroke-[1.5] text-muted-foreground" /> {label}
            </Row>
          ))}
          {products && products.length > 0 && <Group label="Produits" />}
          {products?.slice(0, 5).map((p) => (
            <Row key={p._id} onClick={() => go(`/admin/produits/${p._id}`)}>
              <Thumb src={p.coverUrl} alt="" className="size-9 rounded-md" />
              <span className="truncate">{p.title}</span>
            </Row>
          ))}
          {sales && sales.length > 0 && <Group label="Ventes" />}
          {sales?.map((s) => (
            <Row key={s._id} onClick={() => go(`/admin/ventes?vente=${s._id}`)}>
              <ShoppingBag className="size-5 stroke-[1.5] text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {s.customerName} · <span className="text-muted-foreground">{s.productTitle}</span>
              </span>
            </Row>
          ))}
          {deferred && pages.length === 0 && products?.length === 0 && (sales?.length ?? 0) === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Aucun résultat pour « {deferred} »</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Group({ label }: { label: string }) {
  return <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>;
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface">
      {children}
    </button>
  );
}
