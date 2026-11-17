/**
 * Pays, devises, drapeaux — 100 % dynamique, aucune table écrite à la main :
 *  - liste ISO 3166 : i18n-iso-countries ; noms localisés : Intl.DisplayNames (repli i18n-iso-countries)
 *  - devise d'un pays : country-to-currency
 *  - pays d'un numéro : libphonenumber-js ; pays d'un fuseau horaire : countries-and-timezones
 *  - format monétaire : Intl.NumberFormat
 */
import countries from "i18n-iso-countries";
import fr from "i18n-iso-countries/langs/fr.json";
import countryToCurrency from "country-to-currency";
import ct from "countries-and-timezones";
import { parsePhoneNumberFromString } from "libphonenumber-js";

countries.registerLocale(fr);

const displayRegion = (() => {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" });
  } catch {
    return null;
  }
})();
const displayCurrency = (() => {
  try {
    return new Intl.DisplayNames(["fr"], { type: "currency" });
  } catch {
    return null;
  }
})();

export function isCountryCode(code: string | undefined | null): code is string {
  return Boolean(code && countries.isValid(code.toUpperCase()));
}

export function countryName(code: string | undefined | null): string {
  if (!code) return "";
  const c = code.toUpperCase();
  return displayRegion?.of(c) ?? countries.getName(c, "fr") ?? c;
}

/** Tous les pays, triés par nom français. */
export function allCountries(): { code: string; name: string }[] {
  return Object.keys(countries.getAlpha2Codes())
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function currencyOfCountry(code: string | undefined | null): string | undefined {
  if (!code) return undefined;
  return (countryToCurrency as Record<string, string>)[code.toUpperCase()];
}

export function currencyName(code: string): string {
  return displayCurrency?.of(code.toUpperCase()) ?? code;
}

/** Drapeau SVG (paquet country-flag-icons, servi par son CDN officiel). */
export function flagUrl(code: string): string {
  return `https://purecatamphetamine.github.io/country-flag-icons/3x2/${code.toUpperCase()}.svg`;
}

export function countryFromPhone(phone: string | undefined | null): string | undefined {
  if (!phone) return undefined;
  return parsePhoneNumberFromString(phone.trim().startsWith("+") ? phone : `+${phone.replace(/\D/g, "")}`)?.country;
}

export function normalizePhone(phone: string, defaultCountry?: string) {
  const p = parsePhoneNumberFromString(phone, defaultCountry as Parameters<typeof parsePhoneNumberFromString>[1]);
  return p && p.isValid() ? { e164: p.number as string, country: p.country, national: p.formatInternational() } : null;
}

export function countryFromTimezone(tz: string | undefined | null): string | undefined {
  if (!tz) return undefined;
  return ct.getCountryForTimezone(tz)?.id;
}

const fmtCache = new Map<string, Intl.NumberFormat>();
function formatter(currency: string) {
  let f = fmtCache.get(currency);
  if (!f) {
    try {
      f = new Intl.NumberFormat("fr-FR", { style: "currency", currency, currencyDisplay: "narrowSymbol" });
    } catch {
      f = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
    }
    fmtCache.set(currency, f);
  }
  return f;
}

/** Décimales officielles d'une devise (0 pour XOF, 2 pour USD…). */
export function currencyDigits(currency: string): number {
  return formatter(currency).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Montant formaté. Les francs CFA gardent l'écriture « 2 500 F CFA » familière aux clients. */
export function formatMoney(amount: number, currency: string): string {
  const c = currency.toUpperCase();
  if (c === "XOF" || c === "XAF") return `${new Intl.NumberFormat("fr-FR").format(Math.round(amount)).replace(/[  ]/g, " ")} F CFA`;
  return formatter(c).format(amount).replace(/[  ]/g, " ");
}
