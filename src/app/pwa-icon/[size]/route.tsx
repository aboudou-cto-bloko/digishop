import { ImageResponse } from "next/og";

const SIZES: Record<string, { px: number; pad: number }> = {
  "180": { px: 180, pad: 0.16 },
  "192": { px: 192, pad: 0.14 },
  "512": { px: 512, pad: 0.14 },
  // Zone de sécurité Android : le logo doit tenir dans le cercle central (80 %)
  maskable: { px: 512, pad: 0.26 },
};

/** Icônes de la PWA du dashboard, dessinées à partir du logo (aucun fichier binaire à maintenir). */
export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const cfg = SIZES[size];
  if (!cfg) return new Response("Not found", { status: 404 });
  const inner = Math.round(cfg.px * (1 - cfg.pad * 2));
  // Icône de la marque sur fond noir (couleurs du logo)
  // Les fichiers de public/ ne sont pas dans le bundle serveur : on lit l'icône servie par le site lui-même
  const res = await fetch(new URL("/brand/icon.png", req.url));
  if (!res.ok) return new Response("Icon missing", { status: 500 });
  const src = `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#141414" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={inner} height={inner} alt="" />
      </div>
    ),
    { width: cfg.px, height: cfg.px, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
