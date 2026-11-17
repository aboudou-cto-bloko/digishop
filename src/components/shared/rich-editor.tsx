"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { useMutation } from "convex/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { prepareImage } from "@/lib/image-prep";
import { uploadToConvex } from "@/lib/upload";
import { errorMessage } from "@/lib/format";
import { parseVideoUrl } from "@/lib/video-embed";
import { VideoEmbed } from "./video-node";
import {
  Bold,
  Heading2,
  Heading3,
  Highlighter,
  Clapperboard,
  ImagePlus,
  Italic,
  Loader2,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toHtml } from "@/lib/rich-html";
import { HIGHLIGHT_COLORS } from "@/lib/highlight-colors";
import { cn } from "@/lib/utils";

/**
 * Éditeur WYSIWYG léger (Tiptap) : ce que tu vois est ce que le client verra.
 * Barre d'outils fixe (plus découvrable qu'une bulle), raccourcis clavier standards (Ctrl+B, Ctrl+I…).
 */
export function RichEditor({
  value,
  onChange,
  placeholder = "Écris ici…",
  minHeight = 260,
  autoClearPlaceholders = false,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Modèles légaux : un passage surligné « [à compléter] » perd son surlignage dès qu'il est rempli. */
  autoClearPlaceholders?: boolean;
  className?: string;
}) {
  const genUrl = useMutation(api.settings.generateUploadUrl);
  const imageUrl = useMutation(api.media.imageUrl);
  const [uploading, setUploading] = useState(0);
  const [videoOpen, setVideoOpen] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  /** Position d'insertion d'un bloc média : toujours au premier niveau, après le paragraphe / la liste en cours. */
  const blockPos = (ed: Editor, pos?: number) => {
    const doc = ed.state.doc;
    const $at = doc.resolve(Math.min(pos ?? ed.state.selection.to, doc.content.size));
    return $at.depth === 0 ? $at.pos : $at.after(1);
  };

  /** Vidéo depuis un lien YouTube / Vimeo / TikTok. Renvoie false si le lien n'est pas reconnu. */
  const insertVideo = (url: string, pos?: number) => {
    const v = parseVideoUrl(url);
    const ed = editorRef.current;
    if (!v || !ed) return false;
    ed.chain().focus().insertContentAt(blockPos(ed, pos), { type: "video", attrs: { video: `${v.provider}:${v.id}`, ratio: v.ratio } }).run();
    return true;
  };

  /** Envoie les images puis les insère à la position voulue (curseur, dépôt ou collage). */
  const insertImages = async (files: File[], pos?: number) => {
    const images = files.filter((f) => /^image\/(jpeg|png|webp|gif)$/.test(f.type));
    if (files.length && !images.length) return toast.error("Format non accepté : JPG, PNG, WebP ou GIF.");
    for (const original of images) {
      if (original.size > 15 * 1024 * 1024) {
        toast.error(`${original.name} : image trop lourde (15 Mo max avant compression).`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const { file, width, height } = await prepareImage(original);
        if (file.size > 5 * 1024 * 1024) throw new Error("Image trop lourde même après compression (5 Mo max).");
        const storageId = await uploadToConvex(await genUrl(), file);
        const src = await imageUrl({ storageId: storageId as never });
        const alt = original.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 120);
        const ed = editorRef.current;
        if (!ed) return;
        const node = { type: "image", attrs: { src, alt, width, height } };
        // Toujours en bloc de premier niveau, après le paragraphe / la liste en cours : jamais dans une puce ou une citation
        ed.chain().focus().insertContentAt(blockPos(ed, pos), node).run();
      } catch (e) {
        toast.error(`${original.name} : ${errorMessage(e)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      Placeholder.configure({ placeholder }),
      Highlight.configure({ multicolor: true }),
      // Images : bloc pleine largeur, dimensions conservées (réservent la place, aucun recadrage)
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            width: { default: null },
            height: { default: null },
          };
        },
      }).configure({ inline: false, allowBase64: false }),
      VideoEmbed,
    ],
    content: toHtml(value),
    editorProps: {
      attributes: { class: "rich focus:outline-none px-4 py-4 sm:px-5", style: `min-height:${minHeight}px` },
      // Glisser-déposer et coller une image depuis l'ordinateur ou le téléphone
      handleDrop: (view, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (moved || !files.some((f) => f.type.startsWith("image/"))) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImages(files, pos);
        return true;
      },
      handlePaste: (_view, event) => {
        // Un lien de vidéo collé seul devient directement un lecteur intégré
        const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
        if (text && !/\s/.test(text) && parseVideoUrl(text)) {
          event.preventDefault();
          insertVideo(text);
          return true;
        }
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.some((f) => f.type.startsWith("image/"))) return false;
        event.preventDefault();
        void insertImages(files);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if (autoClearPlaceholders && clearFilledPlaceholders(editor)) return; // la transaction relance onUpdate
      onChange(editor.isEmpty ? "" : editor.getHTML());
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-2xl border border-border bg-card focus-within:ring-2 focus-within:ring-foreground/10">
        {editor ? (
          <Toolbar
            editor={editor}
            showHighlight={!autoClearPlaceholders}
            onImages={(files) => void insertImages(files)}
            videoOpen={videoOpen}
            onToggleVideo={() => setVideoOpen((o) => !o)}
            uploading={uploading > 0}
          />
        ) : (
          <div className="h-[52px] border-b border-border bg-surface" />
        )}
        {videoOpen && <VideoPanel onInsert={insertVideo} onClose={() => setVideoOpen(false)} />}
        <EditorContent editor={editor} />
        {uploading > 0 && (
          <div className="flex items-center gap-2 border-t border-border bg-surface px-4 py-2.5 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> Envoi de {uploading > 1 ? `${uploading} images` : "l'image"}…
          </div>
        )}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Images : JPG, PNG, WebP ou GIF · largeur conseillée 1200 px · compressées automatiquement. Vidéos : colle un lien YouTube, Vimeo ou TikTok dans le texte.
      </p>
    </div>
  );
}

/** Retire le surlignage des passages qui ne contiennent plus de « [ … ] ». Renvoie true si le document a changé. */
function clearFilledPlaceholders(editor: Editor): boolean {
  const type = editor.schema.marks.highlight;
  if (!type) return false;
  const runs: { from: number; to: number; text: string }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const marked = node.marks.some((m) => m.type === type);
    const last = runs[runs.length - 1];
    if (!marked) return;
    if (last && last.to === pos) {
      last.to = pos + node.nodeSize;
      last.text += node.text ?? "";
    } else {
      runs.push({ from: pos, to: pos + node.nodeSize, text: node.text ?? "" });
    }
  });
  const filled = runs.filter((r) => !/\[[^\]]*\]/.test(r.text));
  if (filled.length === 0) return false;
  const tr = editor.state.tr;
  for (const r of filled) tr.removeMark(r.from, r.to, type);
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  return true;
}

function Toolbar({
  editor,
  showHighlight,
  onImages,
  videoOpen,
  onToggleVideo,
  uploading,
}: {
  editor: Editor;
  showHighlight: boolean;
  onImages: (files: File[]) => void;
  videoOpen: boolean;
  onToggleVideo: () => void;
  uploading: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      p: e.isActive("paragraph"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      mark: e.isActive("highlight"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-surface px-1.5 py-1.5" role="toolbar" aria-label="Mise en forme">
      <Group>
        <Btn label="Texte normal" active={s.p} onClick={() => chain().setParagraph().run()}>
          <Pilcrow />
        </Btn>
        <Btn label="Grand titre" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          <Heading2 />
        </Btn>
        <Btn label="Sous-titre" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          <Heading3 />
        </Btn>
      </Group>
      <Group>
        <Btn label="Gras (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
          <Bold />
        </Btn>
        <Btn label="Italique (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic />
        </Btn>
        <Btn label="Souligné (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
          <Underline />
        </Btn>
        <Btn label="Barré" active={s.strike} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough />
        </Btn>
        {showHighlight && (
          <HighlightPicker
            active={s.mark}
            onPick={(color) => (color ? chain().setHighlight({ color }).run() : chain().unsetHighlight().run())}
          />
        )}
      </Group>
      <Group>
        <Btn label="Liste à puces" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
          <List />
        </Btn>
        <Btn label="Liste numérotée" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
          <ListOrdered />
        </Btn>
        <Btn label="Citation" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
          <Quote />
        </Btn>
        <Btn label="Séparateur" onClick={() => chain().setHorizontalRule().run()}>
          <Minus />
        </Btn>
        <Btn label="Insérer une image" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        </Btn>
        <Btn label="Insérer une vidéo (YouTube, Vimeo, TikTok)" active={videoOpen} onClick={onToggleVideo}>
          <Clapperboard />
        </Btn>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            onImages([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </Group>
      <Group>
        <LinkButton editor={editor} active={s.link} />
      </Group>
      <div className="ml-auto flex">
        <Btn label="Annuler (Ctrl+Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
          <Undo2 />
        </Btn>
        <Btn label="Rétablir (Ctrl+Maj+Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
          <Redo2 />
        </Btn>
      </div>
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex items-center border-r border-border pr-0.5 mr-0.5 last:border-0">{children}</div>;
}

/** Vidéo par lien : bandeau pleine largeur sous la barre d'outils (tient dans l'écran, même sur 320 px). */
function VideoPanel({ onInsert, onClose }: { onInsert: (url: string) => boolean; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const submit = () => {
    if (onInsert(url)) onClose();
    else setError(true);
  };
  return (
    <div className="border-b border-border bg-surface/70 px-3 py-3 sm:px-4">
      <div className="flex items-center gap-2">
        <label htmlFor="video-url" className="sr-only">
          Lien de la vidéo
        </label>
        <input
          id="video-url"
          autoFocus
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") onClose();
          }}
          placeholder="Colle le lien de la vidéo"
          inputMode="url"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-base outline-none focus:ring-2 focus:ring-foreground/10"
        />
        <button type="button" onClick={submit} className="h-11 shrink-0 rounded-xl bg-foreground px-4 text-sm font-semibold text-background">
          Insérer
        </button>
        <button type="button" onClick={onClose} aria-label="Fermer" className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-card">
          <X className="size-4" />
        </button>
      </div>
      <p className={cn("mt-1.5 px-1 text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}>
        {error ? "Lien non reconnu. " : ""}YouTube (vidéos et Shorts), Vimeo ou TikTok.
      </p>
    </div>
  );
}

/** Surligneur multicolore : palette fermée de 6 couleurs (les seules acceptées par les nettoyeurs). */
function HighlightPicker({ active, onPick }: { active: boolean; onPick: (color: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Btn label="Surligner" active={active || open} onClick={() => setOpen((o) => !o)}>
        <Highlighter />
      </Btn>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 flex w-max max-w-[calc(100vw-2.5rem)] flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1.5 shadow-lg" role="menu">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="menuitem"
              title={c.label}
              aria-label={`Surligner en ${c.label.toLowerCase()}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(c.value);
                setOpen(false);
              }}
              className="size-8 rounded-lg border border-black/10"
              style={{ background: c.value }}
            />
          ))}
          <button
            type="button"
            role="menuitem"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
            className="h-8 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-surface"
          >
            Retirer
          </button>
        </div>
      )}
    </div>
  );
}

function Btn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // garde la sélection dans l'éditeur
      onClick={onClick}
      className={cn(
        "flex size-10 items-center justify-center rounded-lg text-foreground/80 transition [&_svg]:size-[18px] [&_svg]:stroke-[1.8] sm:size-9",
        active ? "bg-foreground text-background" : "hover:bg-card",
        disabled && "opacity-35 hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  const apply = () => {
    const href = url.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const full = /^(https?:|mailto:|tel:)/i.test(href) ? href : `https://${href}`;
      if (editor.state.selection.empty && !active) {
        editor.chain().focus().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href: full } }] }).run();
      } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href: full }).run();
      }
    }
    setOpen(false);
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
          setOpen(o);
        }}
      >
        <PopoverTrigger
          title="Lien"
          aria-label="Lien"
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "flex size-10 items-center justify-center rounded-lg text-foreground/80 [&_svg]:size-[18px] [&_svg]:stroke-[1.8] sm:size-9",
            active ? "bg-foreground text-background" : "hover:bg-card",
          )}
        >
          <Link2 />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 rounded-2xl p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
            className="space-y-2"
          >
            <label className="block text-sm font-semibold" htmlFor="rich-link">
              Adresse du lien
            </label>
            <input
              id="rich-link"
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://wa.me/229…"
              className="h-11 w-full rounded-xl border border-border px-3 text-base outline-none focus:ring-2 focus:ring-foreground/10"
            />
            <div className="flex gap-2">
              <button type="submit" className="h-10 flex-1 rounded-xl bg-foreground text-sm font-semibold text-background">
                Appliquer
              </button>
              {active && (
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().extendMarkRange("link").unsetLink().run();
                    setOpen(false);
                  }}
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-surface px-3 text-sm font-semibold"
                >
                  <Unlink className="size-4" /> Retirer
                </button>
              )}
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </>
  );
}
