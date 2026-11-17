import { ImageResponse } from "next/og";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { onColor } from "@/lib/color";
import { getStore } from "@/lib/store-context";

export const size = { width: 1200, height: 630 };

export async function GET() {
  const store = await getStore();
  const [s, products] = await Promise.all([
    fetchQuery(api.settings.publicSettings, { storeId: store._id }),
    fetchQuery(api.products.listPublished, { storeId: store._id }),
  ]);
  const covers = products.map((p) => p.coverUrl).filter((u): u is string => Boolean(u)).slice(0, 3);
  const accent = s.theme.accent;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: s.theme.background, padding: 64, fontFamily: "sans-serif", position: "relative" }}>
        {s.theme.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.theme.coverUrl} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, width: 1200, height: 630, objectFit: "cover", opacity: 0.18 }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, fontWeight: 800, color: "#141414" }}>{s.theme.coverTitle || s.storeName}</div>
          {(s.theme.coverSubtitle || s.tagline) && <div style={{ fontSize: 34, color: "#3f433f", marginTop: 22, maxWidth: 640 }}>{s.theme.coverSubtitle || s.tagline}</div>}
          <div style={{ display: "flex", marginTop: 40 }}>
            <div style={{ background: accent, color: onColor(accent), fontSize: 30, fontWeight: 700, padding: "18px 34px", borderRadius: 22 }}>
              {`${products.length} produit${products.length > 1 ? "s" : ""} · accès immédiat`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          {covers.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt="" width={190} height={238} style={{ width: 190, height: 238, objectFit: "cover", borderRadius: 24, transform: `rotate(${(i - 1) * 4}deg)` }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
