import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="text-center">
        <p className="font-heading text-7xl">404</p>
        <h1 className="mt-3 text-xl font-semibold">Cette page n&apos;existe pas (ou plus)</h1>
        <Link href="/" className="mt-6 inline-flex h-12 items-center rounded-2xl bg-brand text-brand-foreground px-6 font-semibold">
          Voir la boutique
        </Link>
      </div>
    </main>
  );
}
