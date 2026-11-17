/**
 * Vidéos intégrées dans les contenus riches. On ne stocke jamais d'iframe saisie par l'utilisateur :
 * seulement « fournisseur + identifiant », et le lecteur est reconstruit ici (liste blanche stricte).
 */

export type VideoProvider = "youtube" | "vimeo" | "tiktok";
export type VideoRatio = "16/9" | "9/16";
export type Video = { provider: VideoProvider; id: string; ratio: VideoRatio };

const ID: Record<VideoProvider, RegExp> = {
  youtube: /^[A-Za-z0-9_-]{11}$/,
  vimeo: /^\d{6,12}$/,
  tiktok: /^\d{8,25}$/,
};

/** Lien collé (YouTube, Shorts, youtu.be, Vimeo, TikTok) → vidéo reconnue, sinon null. */
export function parseVideoUrl(input: string): Video | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be" && parts[0]) return make("youtube", parts[0], "16/9");
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    if (parts[0] === "watch") return make("youtube", url.searchParams.get("v") ?? "", "16/9");
    if (parts[0] === "shorts") return make("youtube", parts[1] ?? "", "9/16");
    if (parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") return make("youtube", parts[1] ?? "", "16/9");
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = [...parts].reverse().find((p) => /^\d+$/.test(p));
    return id ? make("vimeo", id, "16/9") : null;
  }
  if (host === "tiktok.com") {
    const i = parts.indexOf("video");
    if (i >= 0 && parts[i + 1]) return make("tiktok", parts[i + 1], "9/16");
    if (parts[0] === "embed") return make("tiktok", parts[parts.length - 1] ?? "", "9/16");
  }
  return null;
}

function make(provider: VideoProvider, id: string, ratio: VideoRatio): Video | null {
  return ID[provider].test(id) ? { provider, id, ratio } : null;
}

/** Valeur de l'attribut data-video (« youtube:ID ») → vidéo validée, sinon null. */
export function parseVideoAttr(value: string | null | undefined, ratio?: string | null): Video | null {
  const [provider, id] = (value ?? "").split(":");
  if (provider !== "youtube" && provider !== "vimeo" && provider !== "tiktok") return null;
  if (!ID[provider].test(id ?? "")) return null;
  return { provider, id, ratio: ratio === "9/16" || provider === "tiktok" ? "9/16" : "16/9" };
}

/** Adresse du lecteur officiel (YouTube sans cookies, Vimeo sans suivi). */
export function embedSrc(v: Video): string {
  if (v.provider === "youtube") return `https://www.youtube-nocookie.com/embed/${v.id}?rel=0&modestbranding=1&playsinline=1`;
  if (v.provider === "vimeo") return `https://player.vimeo.com/video/${v.id}?dnt=1`;
  return `https://www.tiktok.com/embed/v2/${v.id}`;
}

export const VIDEO_LABELS: Record<VideoProvider, string> = { youtube: "YouTube", vimeo: "Vimeo", tiktok: "TikTok" };

/** Attributs complets de l'iframe (identiques en éditeur, aperçu et boutique). */
export function iframeAttrs(v: Video): Record<string, string> {
  return {
    src: embedSrc(v),
    title: `Vidéo ${VIDEO_LABELS[v.provider]}`,
    loading: "lazy",
    allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
    allowfullscreen: "true",
    // YouTube exige l'origine de la page (sinon « erreur 153 ») : on l'envoie sans le chemin
    referrerpolicy: "strict-origin-when-cross-origin",
  };
}
