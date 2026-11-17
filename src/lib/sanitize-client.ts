"use client";

import { toHtml } from "./rich-html";
import { safeHighlight } from "./highlight-colors";
import { isOwnImage, safeDim } from "./rich-images";
import { iframeAttrs, parseVideoAttr } from "./video-embed";

const ALLOWED = new Set(["P", "BR", "H2", "H3", "STRONG", "B", "EM", "I", "U", "S", "A", "UL", "OL", "LI", "BLOCKQUOTE", "HR", "MARK", "IMG", "DIV"]);

/** Même liste blanche que src/lib/sanitize.ts, côté navigateur (aperçu admin), via DOMParser. */
export function safeRichHtmlClient(value: string | undefined): string {
  const doc = new DOMParser().parseFromString(`<div>${toHtml(value)}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "SVG", "MATH"]);
  // Parcours en profondeur : on nettoie les enfants AVANT de traiter l'élément,
  // pour qu'un contenu remonté d'une balise interdite soit lui aussi nettoyé.
  const clean = (el: Element) => {
    for (const child of [...el.children]) clean(child);
    if (el === root) return;
    if (DROP.has(el.tagName.toUpperCase())) {
      el.remove();
      return;
    }
    if (!ALLOWED.has(el.tagName.toUpperCase())) {
      el.replaceWith(...el.childNodes);
      return;
    }
    if (el.tagName === "DIV") {
      const v = parseVideoAttr(el.getAttribute("data-video"), el.getAttribute("data-ratio"));
      if (!v) {
        el.replaceWith(...el.childNodes);
        return;
      }
      for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
      el.setAttribute("class", "video-embed");
      el.setAttribute("data-video", `${v.provider}:${v.id}`);
      el.setAttribute("data-ratio", v.ratio);
      const frame = doc.createElement("iframe");
      for (const [k, val] of Object.entries(iframeAttrs(v))) frame.setAttribute(k, val);
      el.replaceChildren(frame);
      return;
    }
    if (el.tagName === "IMG") {
      const src = el.getAttribute("src");
      if (!isOwnImage(src)) {
        el.remove();
        return;
      }
      const alt = (el.getAttribute("alt") ?? "").slice(0, 160);
      const w = safeDim(el.getAttribute("width"));
      const h = safeDim(el.getAttribute("height"));
      for (const attr of [...el.attributes]) el.removeAttribute(attr.name);
      el.setAttribute("src", src!);
      el.setAttribute("alt", alt);
      el.setAttribute("loading", "lazy");
      if (w && h) {
        el.setAttribute("width", w);
        el.setAttribute("height", h);
      }
      return;
    }
    const mark = el.tagName === "MARK" ? safeHighlight(el.getAttribute("data-color")) : null;
    for (const attr of [...el.attributes]) {
      const keep = el.tagName === "A" && attr.name === "href" && /^(https?:|mailto:|tel:)/i.test(attr.value.trim());
      if (!keep) el.removeAttribute(attr.name);
    }
    if (mark) {
      el.setAttribute("data-color", mark);
      el.setAttribute("style", `background-color:${mark}`);
    }
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer nofollow");
    }
  };
  clean(root);
  return root.innerHTML;
}
