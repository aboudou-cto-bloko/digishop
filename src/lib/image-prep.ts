"use client";

const MAX_SIDE = 1600;

/**
 * Prépare une image pour le web avant envoi : redimensionnée à 1600 px max (côté le plus long),
 * réencodée en WebP (JPEG si le navigateur ne sait pas). Les GIF restent intacts (animation).
 * Renvoie aussi les dimensions finales : elles réservent la place de l'image (pas de saut de mise en page).
 */
export async function prepareImage(file: File): Promise<{ file: File; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width: w0, height: h0 } = bitmap;
  if (file.type === "image/gif") {
    bitmap.close();
    return { file, width: w0, height: h0 };
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const width = Math.round(w0 * scale);
  const height = Math.round(h0 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  if (!g) {
    bitmap.close();
    return { file, width: w0, height: h0 };
  }
  g.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const toBlob = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.85));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob(file.type === "image/png" ? "image/png" : "image/jpeg");
  // Si la version réencodée est plus lourde (petite image déjà optimisée), on garde l'originale
  if (!blob || (scale === 1 && blob.size >= file.size)) return { file, width: w0, height: h0 };
  const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg";
  return { file: new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type: blob.type }), width, height };
}
