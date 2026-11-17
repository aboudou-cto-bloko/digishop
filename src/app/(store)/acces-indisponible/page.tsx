import Link from "next/link";
import type { Metadata } from "next";
import { getStore } from "@/lib/store-context";

export const metadata: Metadata = { title: "Accès indisponible", robots: { index: false } };

const REASONS: Record<string, { title: string; text: string }> = {
  revoque: { title: "Accès désactivé", text: "L'accès à ce produit a été désactivé par le vendeur." },
  paiement: { title: "Paiement non confirmé", text: "Ce téléchargement sera disponible dès que ton paiement sera confirmé." },
  fichier: { title: "Fichier introuvable", text: "Ce fichier n'est plus disponible. Contacte le vendeur pour obtenir la nouvelle version." },
  lien: { title: "Lien invalide", text: "Ce lien de téléchargement est incomplet ou erroné. Utilise le lien reçu par email." },
};

export default async function Unavailable({ searchParams }: { searchParams: Promise<{ raison?: string }> }) {
  const r = REASONS[(await searchParams).raison ?? "lien"] ?? REASONS.lien;
  const store = await getStore();
  return (
    <main className="mx-auto max-w-lg px-4 pt-12">
      <div className="rounded-[28px] bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">{r.title}</h1>
        <p className="mt-2 text-muted-foreground">{r.text}</p>
        <Link href={`${store.base}/`} className="mt-6 inline-flex h-12 items-center rounded-2xl bg-brand text-brand-foreground px-6 font-semibold">
          Retour à la boutique
        </Link>
      </div>
    </main>
  );
}
