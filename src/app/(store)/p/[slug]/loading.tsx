/** Squelette de la fiche produit : bandeau, couverture, texte (affiché dès le tap). */
export default function ProductLoading() {
  return (
    <div aria-busy="true" aria-label="Chargement du produit">
      <div className="bg-foreground px-4 pb-8 pt-8">
        <div className="mx-auto max-w-6xl animate-pulse">
          <div className="h-8 w-3/4 rounded-xl bg-background/15" />
          <div className="mt-3 h-4 w-1/2 rounded-lg bg-background/15" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl animate-pulse px-4 pt-6">
        <div className="aspect-[4/5] max-h-[60vh] w-full rounded-[24px] bg-foreground/10 sm:max-w-sm" />
        <div className="mt-6 space-y-3">
          <div className="h-4 w-full rounded bg-foreground/10" />
          <div className="h-4 w-5/6 rounded bg-foreground/10" />
          <div className="h-4 w-2/3 rounded bg-foreground/10" />
        </div>
      </div>
    </div>
  );
}
