import "server-only";
import sanitizeHtml from "sanitize-html";
import { toHtml } from "./rich-html";
import { safeHighlight } from "./highlight-colors";
import { isOwnImage, safeDim } from "./rich-images";
import { iframeAttrs, parseVideoAttr } from "./video-embed";

/** Nettoyage serveur avant affichage public : seules les balises de l'éditeur passent. */
export function safeRichHtml(value: string | undefined): string {
  const clean = sanitizeHtml(toHtml(value), {
    allowedTags: ["p", "br", "h2", "h3", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "blockquote", "hr", "mark", "img", "div"],
    allowedAttributes: { a: ["href", "target", "rel"], mark: ["data-color", "style"], img: ["src", "alt", "width", "height", "loading", "decoding"], div: ["class", "data-video", "data-ratio"] },
    allowedSchemesByTag: { img: ["https", "http"] },
    // Image hors de notre stockage : retirée
    exclusiveFilter: (frame) => frame.tag === "img" && !isOwnImage(frame.attribs.src),
    allowedStyles: { mark: { "background-color": [/^#[0-9a-f]{6}$/i] } },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      // Vidéo : on ne garde que « fournisseur:identifiant » validé ; toute autre div est retirée (contenu conservé)
      div: (tagName, attribs) => {
        const v = parseVideoAttr(attribs["data-video"], attribs["data-ratio"]);
        const out: Record<string, string> = v ? { class: "video-embed", "data-video": `${v.provider}:${v.id}`, "data-ratio": v.ratio } : {};
        return { tagName: v ? tagName : "span", attribs: out };
      },
      img: (tagName, attribs) => {
        const out: Record<string, string> = { src: attribs.src ?? "", alt: (attribs.alt ?? "").slice(0, 160), loading: "lazy", decoding: "async" };
        const w = safeDim(attribs.width);
        const h = safeDim(attribs.height);
        if (w && h) Object.assign(out, { width: w, height: h });
        return { tagName, attribs: out };
      },
      // Surlignage : uniquement une couleur de la palette de l'éditeur, le style est reconstruit
      mark: (tagName, attribs) => {
        const c = safeHighlight(attribs["data-color"]);
        const out: Record<string, string> = c ? { "data-color": c, style: `background-color:${c}` } : {};
        return { tagName, attribs: out };
      },
      a: (tagName, attribs) => ({
        tagName,
        attribs: { href: attribs.href ?? "#", target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
    },
  });
  // Les iframes saisies sont toujours supprimées ; le lecteur officiel est reconstruit depuis l'identifiant validé
  return clean.replace(/<div class="video-embed" data-video="([a-z]+:[A-Za-z0-9_-]+)" data-ratio="(16\/9|9\/16)">[\s\S]*?<\/div>/g, (_m, attr: string, ratio: string) => {
    const v = parseVideoAttr(attr, ratio);
    if (!v) return "";
    const attrs = Object.entries(iframeAttrs(v))
      .map(([k, val]) => `${k}="${val.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`)
      .join(" ");
    return `<div class="video-embed" data-video="${attr}" data-ratio="${v.ratio}"><iframe ${attrs}></iframe></div>`;
  });
}
