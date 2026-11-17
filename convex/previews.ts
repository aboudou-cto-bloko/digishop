"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { PDFDocument } from "pdf-lib";
import { previewCount } from "./lib/preview";

/**
 * Génère l'aperçu gratuit de chaque PDF en attente : un nouveau PDF ne contenant que les N premières pages
 * (jamais plus de la moitié). Le fichier livrable n'est jamais exposé ; un PDF protégé ou illisible → « failed ».
 */
export const generate = internalAction({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    const p = await ctx.runQuery(internal.products.internalGet, { id: productId });
    if (!p) return;
    for (const f of p.files) {
      if (f.previewStatus !== "pending") continue;
      try {
        const blob = await ctx.storage.get(f.storageId);
        if (!blob) throw new Error("fichier introuvable");
        const src = await PDFDocument.load(await blob.arrayBuffer());
        const pages = src.getPageCount();
        const n = previewCount(p.previewPages, pages);
        if (n === 0) {
          await ctx.runMutation(internal.products.setFilePreview, { productId, storageId: f.storageId, pages, status: "none" });
          continue;
        }
        const out = await PDFDocument.create();
        out.setTitle(`Aperçu — ${f.name.replace(/\.[^.]+$/, "")}`);
        for (const page of await out.copyPages(src, Array.from({ length: n }, (_, i) => i))) out.addPage(page);
        const bytes = await out.save();
        const previewId = await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
        await ctx.runMutation(internal.products.setFilePreview, { productId, storageId: f.storageId, pages, previewId, status: "ready" });
      } catch (e) {
        console.warn(`Aperçu impossible pour ${f.name} :`, e instanceof Error ? e.message : e);
        await ctx.runMutation(internal.products.setFilePreview, { productId, storageId: f.storageId, status: "failed" });
      }
    }
  },
});
