"use client";

import { useQuery } from "convex/react";
import { use, useMemo, useState } from "react";
import { api } from "../../../../../../convex/_generated/api";
import { ProductView } from "@/components/store/product-view";
import { safeRichHtmlClient } from "@/lib/sanitize-client";
import { usePreviewStore } from "../../store-preview";

export default function PreviewProduct({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const ctx = usePreviewStore();
  const product = useQuery(api.products.bySlug, ctx ? { storeId: ctx.storeId, slug } : "skip");
  const settings = useQuery(api.settings.previewSettings, ctx ? { storeId: ctx.storeId } : "skip");
  const [now] = useState(() => Date.now());
  const html = useMemo(() => (product ? safeRichHtmlClient(product.description) : ""), [product]);
  if (!ctx || product === undefined || !settings) return null;
  if (product === null) return <p className="p-10 text-center text-muted-foreground">Produit introuvable ou en brouillon.</p>;
  return <ProductView product={product} descriptionHtml={html} whatsapp={settings.whatsapp} now={now} base={`/apercu/${ctx.slug}`} preview />;
}
