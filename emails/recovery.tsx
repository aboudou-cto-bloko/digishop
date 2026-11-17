import { Heading, Img, Link, Section, Text } from "@react-email/components";
import { CtaButton, EmailShell, type StoreInfo } from "./components/shell";
import { c, dateTime } from "./components/theme";

export type RecoveryEmailProps = {
  store: StoreInfo;
  heading: string;
  message: string;
  productTitle: string;
  coverUrl?: string | null;
  priceLabel: string;
  couponCode?: string;
  couponLabel?: string;
  expiresAt?: number;
  resumeUrl: string;
  unsubscribeUrl: string;
  supportEmail?: string;
  /** Pixel d'ouverture (1×1) : mesure les ouvertures, sans effet visible. */
  openPixelUrl?: string;
};

/** Variables utilisables dans l'objet et le message des relances. */
export function fillTemplate(text: string, vars: Record<string, string | undefined>) {
  return text.replace(/\{(prénom|prenom|produit|code|expiration|prix)\}/gi, (_m, key: string) => {
    const k = key.toLowerCase().replace("prenom", "prénom");
    return vars[k] ?? "";
  });
}

/** Relance de panier abandonné : rappel du produit, éventuel code, un seul bouton. */
export default function RecoveryEmail(p: RecoveryEmailProps) {
  const paragraphs = p.message.split(/\n{2,}|\n/).filter((x) => x.trim());
  return (
    <EmailShell
      preview={p.couponCode ? `${p.couponLabel ?? "Une réduction"} avec le code ${p.couponCode}` : `Ta commande « ${p.productTitle} » est toujours là`}
      store={p.store}
      footerNote="Tu reçois cet email car tu as commencé une commande sur notre boutique."
    >
      <Heading as="h1" style={{ margin: "0 0 14px", fontSize: 26, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.02em", color: c.ink }}>
        {p.heading}
      </Heading>
      {paragraphs.map((t, i) => (
        <Text key={i} style={{ margin: "0 0 14px", fontSize: 16, lineHeight: "25px", color: c.text }}>
          {t}
        </Text>
      ))}

      <Section style={{ backgroundColor: c.surface, borderRadius: 18, padding: 14, margin: "10px 0 20px" }}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              {p.coverUrl && (
                <td width={64} style={{ verticalAlign: "top", paddingRight: 14 }}>
                  <Img src={p.coverUrl} width={64} height={80} alt="" style={{ borderRadius: 10, display: "block" }} />
                </td>
              )}
              <td style={{ verticalAlign: "middle" }}>
                <Text style={{ margin: 0, fontSize: 16, lineHeight: "22px", fontWeight: 700, color: c.ink }}>{p.productTitle}</Text>
                <Text style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 600, color: c.ink }}>{p.priceLabel}</Text>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {p.couponCode && (
        <Section style={{ border: `2px dashed ${c.ink}`, borderRadius: 16, padding: "14px 16px", marginBottom: 20, textAlign: "center" }}>
          <Text style={{ margin: 0, fontSize: 13, color: c.muted }}>{p.couponLabel ?? "Ton code"}</Text>
          <Text style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, letterSpacing: "0.08em", color: c.ink, fontFamily: "monospace" }}>{p.couponCode}</Text>
          {p.expiresAt && <Text style={{ margin: "6px 0 0", fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>Valable jusqu&apos;au {dateTime(p.expiresAt)}</Text>}
        </Section>
      )}

      <CtaButton tone="brand" href={p.resumeUrl}>
        Finaliser ma commande →
      </CtaButton>
      <Text style={{ margin: "12px 0 0", fontSize: 13, color: c.muted, textAlign: "center" }}>
        Tes informations sont déjà remplies{p.couponCode ? " et le code est appliqué" : ""}.
      </Text>

      <Text style={{ margin: "26px 0 0", fontSize: 12, color: c.muted, textAlign: "center" }}>
        Tu ne veux plus recevoir ces rappels ?{" "}
        <Link href={p.unsubscribeUrl} style={{ color: c.muted, textDecoration: "underline" }}>
          Se désabonner
        </Link>
      </Text>
      {p.openPixelUrl && <Img src={p.openPixelUrl} width="1" height="1" alt="" style={{ display: "block", width: 1, height: 1, border: 0 }} />}
    </EmailShell>
  );
}

RecoveryEmail.PreviewProps = {
  store: { storeName: "Mon Espace Digital", siteUrl: "https://boutique.exemple.com" },
  heading: "-10 % sur « Guide complet de l'élevage de poulets », rien que pour toi",
  message: "Un souci au moment de payer ? Pour t'aider à te lancer, voici le code RELANCE-K7P2QX : -10 % sur ta commande, valable jusqu'au 4 octobre 2026 à 10:00.",
  productTitle: "Guide complet de l'élevage de poulets",
  coverUrl: "https://placehold.co/256x320/1e3a2f/f8cb3c/png?text=GUIDE",
  priceLabel: "2 500 F CFA",
  couponCode: "RELANCE-K7P2QX",
  couponLabel: "-10 % avec ton code",
  expiresAt: Date.UTC(2026, 9, 4, 9),
  resumeUrl: "https://boutique.exemple.com/checkout/guide?reprise=abc&k=xyz&promo=RELANCE-K7P2QX",
  unsubscribeUrl: "https://boutique.exemple.com/desabonnement?c=abc&t=xyz",
} satisfies RecoveryEmailProps;
