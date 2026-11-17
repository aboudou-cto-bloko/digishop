// Conversion XOF → devise de l'acheteur. Arrondi au supérieur selon les décimales de la devise,
// pour ne jamais encaisser moins que le prix affiché en F CFA.

export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function convertFromXof(amountXof: number, currency: string, rates: Record<string, number>): { amount: number; rate: number } | null {
  const c = currency.toUpperCase();
  if (c === "XOF") return { amount: amountXof, rate: 1 };
  const rate = rates[c];
  if (!rate || !Number.isFinite(rate)) return null;
  const f = 10 ** currencyDigits(c);
  return { amount: Math.ceil(amountXof * rate * f) / f, rate };
}
