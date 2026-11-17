import { mergeAttributes, Node } from "@tiptap/core";
import { iframeAttrs, parseVideoAttr } from "@/lib/video-embed";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    video: { setVideo: (attrs: { video: string; ratio: string }) => ReturnType };
  }
}

/** Bloc vidéo (YouTube, Vimeo, TikTok) : stocké en « fournisseur:identifiant », lecteur reconstruit au rendu. */
export const VideoEmbed = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      video: { default: null, parseHTML: (el) => el.getAttribute("data-video") },
      ratio: { default: "16/9", parseHTML: (el) => el.getAttribute("data-ratio") ?? "16/9" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-video]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const v = parseVideoAttr(node.attrs.video, node.attrs.ratio);
    const wrapper = mergeAttributes({ class: "video-embed", "data-video": node.attrs.video, "data-ratio": v?.ratio ?? "16/9" }, HTMLAttributes.class ? { class: HTMLAttributes.class } : {});
    return v ? ["div", wrapper, ["iframe", iframeAttrs(v)]] : ["div", wrapper];
  },
  addCommands() {
    return {
      setVideo:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
