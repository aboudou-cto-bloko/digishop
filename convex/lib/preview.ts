export const DEFAULT_PREVIEW_PAGES = 3;
export const MAX_PREVIEW_PAGES = 10;

/** Pages réellement copiées dans l'aperçu : jamais plus de la moitié du document. */
export function previewCount(setting: number | undefined, pages: number | undefined) {
  if (!pages) return 0;
  return Math.min(setting ?? DEFAULT_PREVIEW_PAGES, Math.floor(pages / 2));
}
