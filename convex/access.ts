import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { deliverableFiles } from "./sales";
import { storeUrl } from "./lib/stores";

type Resolve =
  | { ok: true; saleId: Id<"sales">; storageId: Id<"_storage">; baseUrl: string }
  | { ok: false; reason: "lien" | "revoque" | "paiement" | "fichier"; baseUrl?: string };

export const resolveDownload = internalQuery({
  args: { saleId: v.string(), key: v.string(), index: v.string() },
  handler: async (ctx, { saleId, key, index }): Promise<Resolve> => {
    const id = ctx.db.normalizeId("sales", saleId);
    const sale = id ? await ctx.db.get(id) : null;
    if (!sale) return { ok: false, reason: "lien" };
    // La page d'erreur s'affiche sur le domaine de la boutique (le domaine du dashboard n'a pas de vitrine)
    const store = await ctx.db.get(sale.storeId);
    const baseUrl = store ? storeUrl(store) : undefined;
    if (!key || sale.accessKey !== key) return { ok: false, reason: "lien", baseUrl };
    if (sale.accessRevoked) return { ok: false, reason: "revoque", baseUrl };
    if (sale.status !== "paid") return { ok: false, reason: "paiement", baseUrl };
    const file = (await deliverableFiles(ctx, sale)).find((f) => f.index === index);
    if (!file) return { ok: false, reason: "fichier", baseUrl };
    return { ok: true, saleId: sale._id, storageId: file.storageId, baseUrl: baseUrl ?? "" };
  },
});
