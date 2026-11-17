"use client";

import createGlobe from "cobe";
import { useEffect, useRef } from "react";

type Point = { code: string; latlng: [number, number] | null; value: number };

/** Angles cobe (phi, theta) qui placent un point [lat, lng] face à l'écran. */
function anglesFor([lat, lng]: [number, number]): [number, number] {
  return [Math.PI - ((lng * Math.PI) / 180 - Math.PI / 2), (lat * Math.PI) / 180];
}

/**
 * Globe des visiteurs / acheteurs (cobe, WebGL). Taille des points ∝ racine de la valeur.
 * Le pays sélectionné est mis en avant et le globe pivote vers lui ; rotation douce sinon (désactivée si « réduire les animations »).
 */
export function CountriesGlobe({ points, selected }: { points: Point[]; selected?: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const target = useRef<[number, number] | null>(null);

  const focus = points.find((p) => p.code === selected)?.latlng ?? null;
  useEffect(() => {
    target.current = focus ? anglesFor(focus) : null;
  }, [focus]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const max = Math.max(1, ...points.map((p) => p.value));
    const markers = points
      .filter((p): p is Point & { latlng: [number, number] } => Boolean(p.latlng) && p.value > 0)
      .map((p) => ({
        location: p.latlng,
        size: 0.03 + 0.09 * Math.sqrt(p.value / max),
        color: (p.code === selected ? [0.92, 0.41, 0.2] : [0.16, 0.47, 0.84]) as [number, number, number],
      }));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = anglesFor(focus ?? markers[0]?.location ?? [9.3, 2.3]);
    let phi = start[0];
    let theta = start[1] * 0.6;
    let width = el.offsetWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const globe = createGlobe(el, {
      devicePixelRatio: dpr,
      width: width * dpr,
      height: width * dpr,
      phi,
      theta,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      mapBaseBrightness: 0.05,
      baseColor: [0.95, 0.96, 0.95],
      markerColor: [0.16, 0.47, 0.84],
      glowColor: [0.93, 0.94, 0.93],
      markers,
    });
    // Taille suivie sur le conteneur (rotation d'écran, menu replié, colonne qui change)
    const ro = new ResizeObserver(() => {
      if (!el.offsetWidth || el.offsetWidth === width) return;
      width = el.offsetWidth;
      globe.update({ width: width * dpr, height: width * dpr });
    });
    ro.observe(el);
    let raf = 0;
    const loop = () => {
      const t = target.current;
      if (t) {
        // Rotation vers le pays choisi (chemin le plus court)
        const d = ((t[0] - phi + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        phi += d * 0.08;
        theta += (t[1] * 0.6 - theta) * 0.08;
      } else if (!reduce) phi += 0.0025;
      globe.update({ phi, theta });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    el.style.opacity = "1";
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      globe.destroy();
    };
    // Le globe est recréé quand les données ou la sélection changent (couleur des points)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(points), selected]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(100%,420px)]">
      <canvas ref={canvas} className="block size-full max-w-full rounded-full opacity-0 transition-opacity duration-700" aria-label="Globe des pays des visiteurs et acheteurs" role="img" />
    </div>
  );
}
