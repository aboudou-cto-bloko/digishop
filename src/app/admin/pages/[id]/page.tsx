"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, EyeOff, Highlighter, Loader2, RotateCcw, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { PublishBadge } from "@/components/admin/ui";
import { RichEditor } from "@/components/shared/rich-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStoreQuery, useStoreMutation, useCurrentStore } from "@/hooks/use-current-store";

export default function PageEditorRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const page = useStoreQuery(api.pages.get, { id: id as Id<"pages"> });
  if (page === undefined) return <Skeleton className="mx-auto h-96 max-w-4xl rounded-3xl" />;
  if (page === null) {
    return (
      <p className="py-20 text-center text-muted-foreground">
        Page introuvable.{" "}
        <Link href="/admin/pages" className="font-semibold underline">
          Retour
        </Link>
      </p>
    );
  }
  // Remonte l'éditeur si le contenu est remplacé côté serveur (ex. « remettre le modèle »)
  return <PageEditor key={`${page._id}-${page.updatedAt}`} page={page} />;
}

function PageEditor({ page }: { page: Doc<"pages"> }) {
  const { store } = useCurrentStore();
  const update = useStoreMutation(api.pages.update);
  const reset = useStoreMutation(api.pages.resetToTemplate);
  const remove = useStoreMutation(api.pages.remove);
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [content, setContent] = useState(page.content);
  const [saving, setSaving] = useState(false);
  const dirty = title !== page.title || slug !== page.slug || content !== page.content;
  const todo = (content.match(/<mark>/g) ?? []).length;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (extra?: { published?: boolean }) => {
    setSaving(true);
    try {
      await update({ id: page._id, title, slug, content, ...extra });
      toast.success(extra?.published === true ? "Page publiée" : extra?.published === false ? "Page repassée en brouillon" : "Page enregistrée");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl pb-28">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/pages" className="flex size-11 items-center justify-center rounded-full bg-surface hover:bg-[#eceeec]" aria-label="Retour aux pages">
          <ArrowLeft className="size-5" />
        </Link>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">Pages de contenu</span>
        <PublishBadge published={page.published} />
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Titre de la page"
        className="w-full bg-transparent font-heading text-[2.2rem] leading-tight outline-none sm:text-5xl"
      />

      {todo > 0 && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#fdf0b0] px-4 py-3 text-[0.95rem] text-[#713f12]">
          <Highlighter className="mt-0.5 size-5 shrink-0" />
          <span>
            <strong>{todo} passage{todo > 1 ? "s" : ""} surligné{todo > 1 ? "s" : ""}</strong> à compléter avec tes informations (RCCM, IFU, adresse…). Clique dessus et remplace le texte entre crochets : le surlignage disparaît tout seul. Ce modèle n&apos;est pas un avis juridique : fais-le relire si besoin.
          </span>
        </div>
      )}

      <RichEditor value={content} onChange={setContent} minHeight={420} placeholder="Rédige ta page…" className="mt-5" autoClearPlaceholders />

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="font-semibold">Adresse de la page</span>
          <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border focus-within:ring-2 focus-within:ring-foreground/10">
            <span className="flex h-full items-center bg-surface px-3 text-sm text-muted-foreground">/pages/</span>
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} className="h-full flex-1 px-3 text-base outline-none" />
          </div>
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (
                !page.published &&
                todo > 0 &&
                !window.confirm(`Il reste ${todo} passage${todo > 1 ? "s" : ""} à compléter : tes clients les verront surlignés. Publier quand même ?`)
              ) {
                return;
              }
              void save({ published: !page.published });
            }}
            disabled={saving}
            className={cn("inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl font-semibold", page.published ? "bg-surface" : "bg-foreground text-background")}
          >
            {page.published ? <EyeOff className="size-5" /> : <Rocket className="size-5" />} {page.published ? "Dépublier" : "Publier"}
          </button>
          {page.published && (
            <a href={`${store.url}/pages/${page.slug}`} target="_blank" rel="noreferrer" className="inline-flex size-12 items-center justify-center rounded-xl bg-surface" aria-label="Voir la page">
              <ExternalLink className="size-5" />
            </a>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2 border-t border-border pt-6">
        {page.kind !== "custom" && (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("Remplacer le contenu actuel par le modèle de départ ? Tes modifications seront perdues.")) return;
              try {
                await reset({ id: page._id });
                toast.success("Modèle remis");
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold hover:bg-surface"
          >
            <RotateCcw className="size-4" /> Remettre le modèle
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            if (!window.confirm(`Supprimer la page « ${page.title} » ?`)) return;
            await remove({ id: page._id });
            router.replace("/admin/pages");
          }}
          className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" /> Supprimer la page
        </button>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-[104px] z-30 flex justify-center px-4 transition lg:bottom-6 lg:pl-[272px]",
          dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <div className="flex w-full max-w-lg items-center gap-3 rounded-2xl bg-foreground p-2 pl-5 text-background shadow-2xl">
          <span className="flex-1 text-sm font-medium">Modifications non enregistrées</span>
          <button type="button" onClick={() => save()} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-foreground disabled:opacity-60">
            {saving && <Loader2 className="size-4 animate-spin" />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
