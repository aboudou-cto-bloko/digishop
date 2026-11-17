/** Retour visuel immédiat pendant le chargement d'une page de boutique (évite les taps répétés sur mobile). */
export default function StoreLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 pt-6" aria-busy="true" aria-label="Chargement">
      <div className="h-8 w-2/3 rounded-xl bg-foreground/10" />
      <div className="mt-3 h-4 w-1/2 rounded-lg bg-foreground/10" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="aspect-[4/5] rounded-[24px] bg-foreground/10" />
        ))}
      </div>
    </div>
  );
}
