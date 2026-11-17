"use client";

import { useEffect } from "react";
import { fbTrack, ttTrack } from "@/lib/tracking";

export function ProductPixel({ id, title, price }: { id: string; title: string; price: number }) {
  useEffect(() => {
    // Laisse le temps au script du pixel de s'initialiser
    const t = setTimeout(() => {
      const data = { content_ids: [id], content_name: title, content_type: "product", value: price, currency: "XOF" };
      fbTrack("ViewContent", data);
      ttTrack("ViewContent", { content_id: id, content_name: title, value: price, currency: "XOF" });
    }, 600);
    return () => clearTimeout(t);
  }, [id, title, price]);
  return null;
}
