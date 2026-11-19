import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireAdmin } from "./lib/auth";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_GIF_BYTES = 15 * 1024 * 1024;
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
    // Les GIF ne sont pas recompressés (sinon l'animation est perdue) : limite plus haute
    const max = meta.contentType === "image/gif" ? MAX_GIF_BYTES : MAX_BYTES;
    if (meta.size > max) {
      await ctx.storage.delete(storageId);
      throw new ConvexError(meta.contentType === "image/gif" ? "GIF trop lourd (15 Mo maximum)." : "Image trop lourde (5 Mo maximum).");
    }
    const url = await ctx.storage.getUrl(storageId);
    if (!url) throw new ConvexError("Image introuvable.");
    return url;
  },
});
