"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useState } from "react";
import { Copy, CopyPlus, Ellipsis, ExternalLink, EyeOff, Loader2, Package, Pencil, Rocket, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { EmptyState, FilterPills, Money, PublishBadge, SearchInput, Thumb } from "@/components/admin/ui";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/format";
import { useStoreQuery, useStoreMutation, useCurrentStore } from "@/hooks/use-current-store";

type Filter = "all" | "draft" | "published";
const FILTERS: { value: Filter; label: string; dot: string }[] = [
  { value: "all", label: "Tout", dot: "#141414" },
  { value: "draft", label: "Brouillon", dot: "#5f645f" },
  { value: "published", label: "Publié", dot: "#22c55e" },
];

export default function ProductsPage() {
  return (
    <Suspense>
      <Products />
    </Suspense>
  );
}

function Products() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const rows = useStoreQuery(api.products.adminList, { status: filter === "all" ? undefined : filter, search: q || undefined });
  const creating = params.get("nouveau") === "1";
  const setCreating = (o: boolean) => router.replace(o ? `${pathname}?nouveau=1` : pathname, { scroll: false });

  return (
    <div>
      <h1 className="mb-4 text-[1.75rem] font-bold lg:hidden">Produits</h1>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} />
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="order-last inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand px-6 text-base font-semibold hover:bg-brand-hover lg:order-none lg:h-12 lg:rounded-xl"
        >
          Ajouter un produit <SquareArrowOutUpRight className="size-5 stroke-[1.6] lg:hidden" />
        </button>
        <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {rows === undefined && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="size-14 rounded-lg" />
              <Skeleton className="h-6 flex-1" />
            </div>
          ))}
        </div>
      )}
      {rows?.length === 0 && (
        <EmptyState
          icon={<Package />}
          title={q || filter !== "all" ? "Aucun produit trouvé" : "Ton premier produit t'attend"}
          text="Ebook, guide PDF, audio, formation : ajoute un fichier, fixe un prix, publie. Tes clients le reçoivent automatiquement après paiement."
          action={
            <button type="button" onClick={() => setCreating(true)} className="inline-flex h-12 items-center rounded-xl bg-brand px-6 font-semibold">
              Ajouter un produit
            </button>
          }
        />
      )}

      {rows && rows.length > 0 && (
        <>
          <ul className="mt-4 overflow-hidden rounded-2xl border border-border lg:hidden">
            {rows.map((p) => (
              <li key={p._id} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0">
                <Link href={`/admin/produits/${p._id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Thumb src={p.coverUrl} alt="" className="h-[60px] w-[70px]" />
                  <div className="min-w-0">
                    <div className="line-clamp-1 font-bold">{p.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                      <Money value={p.price} />
                      {p.status === "draft" && <span>· Brouillon</span>}
                    </div>
                  </div>
                </Link>
                <ProductMenu product={p} />
              </li>
            ))}
          </ul>

          <table className="mt-6 hidden w-full text-left lg:table">
            <thead>
              <tr className="border-b border-border text-[0.95rem] text-foreground/70">
                <th className="py-3 pl-4 font-semibold">Produit</th>
                <th className="py-3 font-semibold">Prix</th>
                <th className="py-3 font-semibold">Ventes</th>
                <th className="py-3 font-semibold">Statut</th>
                <th className="py-3 pr-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p._id} className="border-b border-border hover:bg-surface/70">
                  <td className="py-2 pl-4">
                    <Link href={`/admin/produits/${p._id}`} className="flex items-center gap-3">
                      <Thumb src={p.coverUrl} alt="" className="size-12 rounded-md" />
                      <span className="max-w-md truncate font-semibold">{p.title}</span>
                    </Link>
                  </td>
                  <td className="py-2 font-medium">
                    <Money value={p.price} />
                  </td>
                  <td className="py-2 font-medium">{p.salesCount}</td>
                  <td className="py-2">
                    <PublishBadge published={p.status === "published"} />
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <ProductMenu product={p} boxed />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <CreateDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function ProductMenu({ product, boxed }: { product: Doc<"products">; boxed?: boolean }) {
  const { store } = useCurrentStore();
  const router = useRouter();
  const setStatus = useStoreMutation(api.products.setStatus);
  const duplicate = useStoreMutation(api.products.duplicate);
  const remove = useStoreMutation(api.products.remove);
  const url = `${store.url}/p/${product.slug}`;
  const published = product.status === "published";

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Actions"
        className={
          boxed
            ? "inline-flex size-11 items-center justify-center rounded-xl border border-border bg-card hover:bg-surface"
            : "inline-flex size-11 items-center justify-center rounded-full hover:bg-surface"
        }
      >
        <Ellipsis className={boxed ? "size-5 rotate-90" : "size-5"} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem onClick={() => router.push(`/admin/produits/${product._id}`)}>
          <Pencil className="size-4" /> Modifier
        </DropdownMenuItem>
        {published && (
          <>
            <DropdownMenuItem onClick={() => window.open(url, "_blank")}>
              <ExternalLink className="size-4" /> Voir la page
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Lien du produit copié"))}
            >
              <Copy className="size-4" /> Copier le lien
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem
          onClick={() =>
            act(() => setStatus({ id: product._id, status: published ? "draft" : "published" }), published ? "Produit repassé en brouillon" : "Produit publié 🎉")
          }
        >
          {published ? <EyeOff className="size-4" /> : <Rocket className="size-4" />} {published ? "Dépublier" : "Publier"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            act(async () => {
              const id = await duplicate({ id: product._id });
              router.push(`/admin/produits/${id}`);
            }, "Produit dupliqué")
          }
        >
          <CopyPlus className="size-4" /> Dupliquer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            if (window.confirm(`Supprimer « ${product.title} » ? Cette action est définitive.`)) void act(() => remove({ id: product._id }), "Produit supprimé");
          }}
        >
          <Trash2 className="size-4" /> Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useStoreMutation(api.products.create);
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const id = await create({ title });
      setTitle("");
      router.push(`/admin/produits/${id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-3xl p-6 sm:max-w-md">
        <DialogTitle className="font-heading text-2xl font-normal">Nouveau produit</DialogTitle>
        <p className="-mt-2 text-sm text-muted-foreground">Donne-lui un nom. Tu ajouteras le fichier, le prix et la description juste après.</p>
        <form onSubmit={submit} className="space-y-4">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex. : Guide complet de l'élevage de poulets"
            required
            minLength={3}
            className="h-12 w-full rounded-xl bg-surface px-4 text-base outline-none focus:ring-2 focus:ring-foreground/10"
          />
          <button type="submit" disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold disabled:opacity-60">
            {pending && <Loader2 className="size-4 animate-spin" />} Créer et continuer
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
