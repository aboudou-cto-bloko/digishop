"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, FilePlus2, FileText, Loader2, Scale, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import { PublishBadge } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, fmtDate } from "@/lib/format";
import { useStoreQuery, useStoreMutation } from "@/hooks/use-current-store";

export default function PagesList() {
  const data = useStoreQuery(api.pages.list, {});
  const createDefaults = useStoreMutation(api.pages.createDefaults);
  const create = useStoreMutation(api.pages.create);
  const router = useRouter();
  const [busy, setBusy] = useState<"defaults" | "custom" | null>(null);

  const run = async (kind: "defaults" | "custom") => {
    setBusy(kind);
    try {
      if (kind === "defaults") {
        const n = await createDefaults({});
        toast.success(`${n} page${n > 1 ? "s" : ""} créée${n > 1 ? "s" : ""} en brouillon. Complète les passages surlignés puis publie.`);
      } else {
        const id = await create({ title: "Nouvelle page" });
        router.push(`/admin/pages/${id}`);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-heading text-4xl">Pages de contenu</h1>
        <button
          type="button"
          onClick={() => run("custom")}
          disabled={busy !== null}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-surface px-5 font-semibold hover:bg-[#eceeec] disabled:opacity-60"
        >
          {busy === "custom" ? <Loader2 className="size-4 animate-spin" /> : <FilePlus2 className="size-5" />} Nouvelle page
        </button>
      </div>
      <p className="mb-6 text-[0.95rem] text-muted-foreground">Mentions légales, CGV, confidentialité… Les pages publiées apparaissent en bas de ta boutique.</p>

      {data === undefined && <Skeleton className="h-40 rounded-3xl" />}

      {data && data.missing.length > 0 && (
        <div className="mb-6 rounded-[28px] bg-brand p-6">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-card/70">
              <Scale className="size-6 stroke-[1.6]" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">Tes pages légales, prêtes en 1 clic</h2>
              <p className="mt-1 text-[0.95rem] text-foreground/80">
                Modèles adaptés à la vente de produits numériques au Bénin, déjà remplis avec les infos de ta boutique :{" "}
                {data.missing.map((m) => m.title).join(", ")}.
              </p>
              <button
                type="button"
                onClick={() => run("defaults")}
                disabled={busy !== null}
                className="mt-4 inline-flex h-12 items-center gap-2 rounded-xl bg-foreground px-5 font-semibold text-background disabled:opacity-60"
              >
                {busy === "defaults" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-5" />} Créer les pages
              </button>
            </div>
          </div>
        </div>
      )}

      {data && data.pages.length > 0 && (
        <div className="divide-y divide-border rounded-3xl border border-border">
          {data.pages.map((p) => (
            <Link key={p._id} href={`/admin/pages/${p._id}`} className="flex items-center gap-4 px-4 py-4 hover:bg-surface/60 sm:px-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface">
                <FileText className="size-5 stroke-[1.6]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.title}</div>
                <div className="truncate text-sm text-muted-foreground">
                  /pages/{p.slug} · modifiée le {fmtDate(p.updatedAt)}
                </div>
                {p.todoCount > 0 && (
                  <span className="mt-1.5 inline-flex rounded-full bg-[#fdf0b0] px-2.5 py-0.5 text-xs font-semibold text-[#854d0e]">
                    {p.todoCount} passage{p.todoCount > 1 ? "s" : ""} à compléter
                  </span>
                )}
              </div>
              <PublishBadge published={p.published} />
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
