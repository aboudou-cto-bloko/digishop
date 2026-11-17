import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { ThankYou } from "./thank-you";
import { getStore } from "@/lib/store-context";

export const metadata: Metadata = { title: "Ta commande", robots: { index: false } };

export default async function ThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ saleId: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const { saleId } = await params;
  const k = (await searchParams).k;
  const store = await getStore();
  const settings = await fetchQuery(api.settings.publicSettings, { storeId: store._id });
  return <ThankYou saleId={saleId} accessKey={typeof k === "string" ? k : ""} whatsapp={settings.whatsapp} supportEmail={settings.supportEmail} />;
}
