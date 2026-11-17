"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { StoreHome } from "@/components/store/layouts";
import { usePreviewStore } from "./store-preview";

export default function PreviewHome() {
  const ctx = usePreviewStore();
  const s = useQuery(api.settings.previewSettings, ctx ? { storeId: ctx.storeId } : "skip");
  const products = useQuery(api.products.listPublished, ctx ? { storeId: ctx.storeId } : "skip");
  const [now] = useState(() => Date.now());
  if (!ctx || !s || !products) return null;
  return <StoreHome settings={s} theme={s.theme} products={products} now={now} base={`/apercu/${ctx.slug}`} preview />;
}
