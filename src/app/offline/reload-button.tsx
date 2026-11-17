"use client";

export function ReloadButton() {
  return (
    <button type="button" onClick={() => location.reload()} className="h-12 rounded-2xl bg-foreground px-6 font-semibold text-background">
      Réessayer
    </button>
  );
}
