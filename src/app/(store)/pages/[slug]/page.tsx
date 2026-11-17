import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "../../../../../convex/_generated/api";
import { fmtDate } from "@/lib/format";
import { metaDescription } from "@/lib/seo";
import { safeRichHtml } from "@/lib/sanitize";
import { getStore } from "@/lib/store-context";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = await getStore();
  const page = await fetchQuery(api.pages.publicBySlug, { storeId: store._id, slug: (await params).slug });
  if (!page) return {};
  const { slug } = await params;
  return { title: page.title, description: metaDescription(page.content), alternates: { canonical: `${store.url}/pages/${slug}` } };
}

export default async function ContentPage({ params }: Props) {
  const store = await getStore();
  const page = await fetchQuery(api.pages.publicBySlug, { storeId: store._id, slug: (await params).slug });
  if (!page) notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 sm:pt-12">
      <article className="rounded-[28px] bg-card p-6 sm:p-10">
        <h1 className="font-heading text-[2.2rem] leading-tight sm:text-5xl">{page.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Dernière mise à jour : {fmtDate(page.updatedAt)}</p>
        <div className="rich mt-8 max-w-[68ch]" dangerouslySetInnerHTML={{ __html: safeRichHtml(page.content) }} />
      </article>
    </main>
  );
}
