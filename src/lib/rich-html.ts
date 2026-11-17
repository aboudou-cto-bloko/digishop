/**
 * Format des contenus riches (descriptions produit, pages légales) : HTML produit par l'éditeur Tiptap.
 * Les anciennes descriptions au format « markdown léger » (## titre, - puce, **gras**) sont converties à la volée.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

export function isHtml(value: string): boolean {
  return /^\s*<(p|h[1-6]|ul|ol|blockquote|div|hr|img|figure)[\s>/]/i.test(value);
}

export function legacyToHtml(value: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) out.push(`<ul>${list.map((l) => `<li><p>${inline(l)}</p></li>`).join("")}</ul>`);
    list = [];
  };
  for (const raw of value.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
    } else if (line.startsWith("## ")) {
      flushPara();
      flushList();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (/^(-|•|\*)\s/.test(line)) {
      flushPara();
      list.push(line.replace(/^(-|•|\*)\s/, ""));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join("");
}

export function toHtml(value: string | undefined): string {
  if (!value?.trim()) return "";
  return isHtml(value) ? value : legacyToHtml(value);
}

/** Texte brut (meta description, aperçus). */
export function htmlToText(html: string): string {
  return toHtml(html)
    .replace(/<(br|\/p|\/h[1-6]|\/li)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
