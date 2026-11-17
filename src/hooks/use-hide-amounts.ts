"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "digishop:hide-amounts";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Bouton « œil barré » de Chariow : masque les montants, mémorisé sur l'appareil. */
export function useHideAmounts() {
  const hidden = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => false,
  );
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(KEY, read() ? "0" : "1");
    } catch {}
    listeners.forEach((l) => l());
  }, []);
  return { hidden, toggle };
}
