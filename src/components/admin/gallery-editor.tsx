"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { useStoreMutation } from "@/hooks/use-current-store";
import { errorMessage } from "@/lib/format";
import { prepareImage } from "@/lib/image-prep";
import { uploadToConvex } from "@/lib/upload";

type Item = NonNullable<Doc<"products">["gallery"]>[number];
const MAX_ITEMS = 12;
const ACCEPT = /^image\/(jpeg|png|webp|gif)$/;

/**
 * Galerie de la page de vente : photos et GIF animés (démonstrations, captures du produit).
 * Les photos sont compressées en WebP ; les GIF sont envoyés tels quels pour garder l'animation (15 Mo max).
 */
export function GalleryEditor({ productId, gallery, urls }: { productId: Id<"products">; gallery: Item[]; urls: Record<string, string | null> }) {
  const update = useStoreMutation(api.products.update);
  const genUrl = useMutation(api.settings.generateUploadUrl);
  const [busy, setBusy] = useState(0);

  const save = async (next: Item[]) => {
    try {
      await update({ id: productId, gallery: next });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => ACCEPT.test(f.type));
    if (list?.length && !files.length) return toast.error("Formats acceptés : JPG, PNG, WebP ou GIF.");
    const room = MAX_ITEMS - gallery.length;
    if (files.length > room) toast.error(`${MAX_ITEMS} images maximum : seules les ${room} premières sont ajoutées.`);
    const added: Item[] = [];
    for (const original of files.slice(0, Math.max(0, room))) {
      if (original.size > 15 * 1024 * 1024) {
        toast.error(`${original.name} : 15 Mo maximum.`);
        continue;
      }
      setBusy((n) => n + 1);
      try {
        const { file, width, height } = await prepareImage(original);
        const storageId = (await uploadToConvex(await genUrl(), file)) as Id<"_storage">;
        added.push({ storageId, mime: file.type, width, height });
      } catch (e) {
        toast.error(`${original.name} : ${errorMessage(e)}`);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (added.length) await save([...gallery, ...added]);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= gallery.length) return;
    const next = [...gallery];
    [next[i], next[j]] = [next[j], next[i]];
    void save(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Affichée sous l&apos;image principale. Les GIF animés gardent leur animation (15 Mo max chacun). {gallery.length}/{MAX_ITEMS}
      </p>
      {gallery.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {gallery.map((g, i) => (
            <div key={g.storageId} className="group relative aspect-square overflow-hidden rounded-2xl bg-surface">
              {urls[g.storageId] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[g.storageId] ?? ""} alt="" className="size-full object-cover" loading="lazy" />
              )}
              {g.mime === "image/gif" && <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[0.65rem] font-bold text-white">GIF</span>}
              <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="flex size-8 items-center justify-center rounded-lg bg-card/90 disabled:opacity-40" aria-label="Avancer">
                  <ArrowLeft className="size-4" />
                </button>
                <button type="button" onClick={() => void save(gallery.filter((_, j) => j !== i))} className="flex size-8 items-center justify-center rounded-lg bg-card/90 text-[#b42318]" aria-label="Retirer">
                  <Trash2 className="size-4" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === gallery.length - 1} className="flex size-8 items-center justify-center rounded-lg bg-card/90 disabled:opacity-40" aria-label="Reculer">
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {gallery.length < MAX_ITEMS && (
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:bg-surface">
          {busy > 0 ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6 stroke-[1.4]" />}
          <span className="text-sm font-medium">{busy > 0 ? "Envoi…" : "Ajouter des images ou des GIF"}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" disabled={busy > 0} onChange={(e) => void onFiles(e.target.files)} />
        </label>
      )}
    </div>
  );
}
