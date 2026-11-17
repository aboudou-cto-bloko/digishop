import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { effectivePrice } from "../../../../../../convex/lib/pricing";
import { onColor } from "@/lib/color";
import { formatMoney } from "@/lib/geo";
import { getStore } from "@/lib/store-context";

// Visuel de partage (WhatsApp, Facebook, X…) généré pour chaque produit
export const size = { width: 1200, height: 630 };

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStore();
  const [p, s] = await Promise.all([
    fetchQuery(api.products.bySlug, { storeId: store._id, slug }),
    fetchQuery(api.settings.publicSettings, { storeId: store._id }),
  ]);
  const accent = s.theme.accent;
  if (!p) {
    return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: s.theme.background, fontSize: 64, fontWeight: 700 }}>{s.storeName}</div>, size);
  }
  const { price, compareAt } = effectivePrice(p, Date.now());
  const title = p.title.length > 70 ? `${p.title.slice(0, 68)}…` : p.title;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: s.theme.background, padding: 56, gap: 56, fontFamily: "sans-serif" }}>
        {p.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.coverUrl} alt="" width={414} height={518} style={{ width: 414, height: 518, objectFit: "cover", borderRadius: 32 }} />
        ) : (
          <div style={{ width: 414, height: 518, borderRadius: 32, background: "#141414" }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          <div style={{ fontSize: 28, color: "#6f746f", fontWeight: 600, letterSpacing: 2, textTransform: "uppercase" }}>{s.storeName}</div>
          <div style={{ fontSize: 60, lineHeight: 1.08, fontWeight: 800, color: "#141414", marginTop: 18 }}>{title}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginTop: 34 }}>
            <div style={{ fontSize: 54, fontWeight: 800, color: "#141414" }}>{formatMoney(price, "XOF")}</div>
            {compareAt && <div style={{ fontSize: 34, color: "#8a8f8a", textDecoration: "line-through" }}>{formatMoney(compareAt, "XOF")}</div>}
          </div>
          <div style={{ display: "flex", marginTop: 34 }}>
            <div style={{ background: accent, color: onColor(accent), fontSize: 30, fontWeight: 700, padding: "18px 34px", borderRadius: 22 }}>Accès immédiat · Mobile Money</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
