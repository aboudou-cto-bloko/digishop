"use client";

import { useQuery } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { convertFromXof } from "../../../convex/lib/fx";
import { countryFromTimezone, currencyOfCountry, formatMoney, isCountryCode } from "@/lib/geo";

const KEY = "ds_country";

type Visitor = {
  country?: string;
  /** Devise d'affichage et de paiement : celle du pays si le vendeur l'a activée, sinon XOF */
  currency: string;
  setCountry: (c: string) => void;
  /** Pays couverts par la boutique ([] = partout) */
  coverage: string[];
  acceptedCurrencies: string[];
  convert: (xof: number) => { amount: number; currency: string; converted: boolean };
  format: (xof: number) => string;
};

const Ctx = createContext<Visitor | null>(null);

export function VisitorProvider({
  initialCountry,
  acceptedCurrencies,
  coverage,
  children,
}: {
  initialCountry?: string;
  acceptedCurrencies: string[];
  coverage: string[];
  children: ReactNode;
}) {
  const [country, setCountryState] = useState<string | undefined>(initialCountry);
  const fx = useQuery(api.catalog.rates);

  useEffect(() => {
    // Choix manuel du visiteur > géolocalisation IP (serveur) > fuseau horaire du navigateur
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    /* eslint-disable react-hooks/set-state-in-effect -- lecture après hydratation (localStorage / Intl indisponibles côté serveur) */
    if (saved && isCountryCode(saved)) setCountryState(saved);
    else if (!initialCountry) {
      const tz = countryFromTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (tz) setCountryState(tz);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [initialCountry]);

  const setCountry = useCallback((c: string) => {
    setCountryState(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {}
  }, []);

  const value = useMemo<Visitor>(() => {
    const local = currencyOfCountry(country);
    const currency = local && acceptedCurrencies.includes(local) && (local === "XOF" || fx?.rates[local]) ? local : "XOF";
    const convert = (xof: number) => {
      if (currency === "XOF" || !fx) return { amount: xof, currency: "XOF", converted: false };
      const c = convertFromXof(xof, currency, fx.rates);
      return c ? { amount: c.amount, currency, converted: true } : { amount: xof, currency: "XOF", converted: false };
    };
    return {
      country,
      currency,
      setCountry,
      coverage,
      acceptedCurrencies,
      convert,
      format: (xof: number) => {
        const c = convert(xof);
        return formatMoney(c.amount, c.currency);
      },
    };
  }, [country, acceptedCurrencies, coverage, fx, setCountry]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const FALLBACK: Visitor = {
  currency: "XOF",
  setCountry: () => {},
  coverage: [],
  acceptedCurrencies: ["XOF"],
  convert: (xof) => ({ amount: xof, currency: "XOF", converted: false }),
  format: (xof) => formatMoney(xof, "XOF"),
};

export function useVisitor(): Visitor {
  return useContext(Ctx) ?? FALLBACK;
}
