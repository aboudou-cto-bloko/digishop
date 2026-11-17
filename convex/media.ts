import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAdmin } from "./lib/auth";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Image insérée dans une description : contrôle du type et du poids, puis URL publique du fichier. */
export const imageUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await requireAdmin(ctx);
    const meta = await ctx.db.system.get(storageId);
    if (!meta) throw new ConvexError("Image introuvable.");
    if (!meta.contentType || !ALLOWED.includes(meta.contentType)) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("Format non accepté : JPG, PNG, WebP ou GIF.");
    }
    if (meta.size > MAX_BYTES) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("Image trop lourde (5 Mo maximum).");
    }
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new ConvexError("Image introuvable.");
    return url;
  },
});
