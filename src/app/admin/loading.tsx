/** Chargement d'une page du dashboard : squelette léger dans le cadre de l'app (le menu reste utilisable). */
export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse" aria-busy="true" aria-label="Chargement">
      <div className="h-9 w-48 rounded-xl bg-foreground/10" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-3xl bg-foreground/[0.06]" />
        ))}
      </div>
    </div>
  );
}
