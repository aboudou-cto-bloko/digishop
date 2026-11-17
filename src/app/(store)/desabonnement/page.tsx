import type { Metadata } from "next";
import { Unsubscribe } from "./unsubscribe";

export const metadata: Metadata = { title: "Désabonnement", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ c?: string; t?: string }> }) {
  const { c, t } = await searchParams;
  return <Unsubscribe c={c ?? ""} t={t ?? ""} />;
}
