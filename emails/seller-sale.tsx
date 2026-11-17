import { Heading, Img, Section, Text } from "@react-email/components";
import { CtaButton, EmailShell, Row2, type StoreInfo } from "./components/shell";
import { c, dateTime, fcfa } from "./components/theme";

export type SellerSaleEmailProps = {
  store: StoreInfo;
  productTitle: string;
  coverUrl?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  net: number;
  fees?: number;
  method?: string;
  couponCode?: string;
  source?: string;
  paidAt: number;
  dashboardUrl: string;
};

export function sellerSaleSubject(p: Pick<SellerSaleEmailProps, "net" | "productTitle">) {
  return `💰 Nouvelle vente : ${fcfa(p.net)} · ${p.productTitle}`;
}

/** Notification vendeur : le montant d'abord, puis qui, quoi, d'où. */
export default function SellerSaleEmail(p: SellerSaleEmailProps) {
  return (
    <EmailShell preview={`${p.customerName} vient d'acheter « ${p.productTitle} »`} store={p.store} footerNote="Notification de vente envoyée par ta boutique.">
      <Text style={{ margin: 0, fontSize: 14, fontWeight: 600, color: c.muted }}>Nouvelle vente 🎉</Text>
      <Heading as="h1" style={{ margin: "6px 0 4px", fontSize: 40, lineHeight: "46px", fontWeight: 700, letterSpacing: "-0.03em", color: c.ink }}>
        {fcfa(p.net)}
      </Heading>
      <Text style={{ margin: "0 0 22px", fontSize: 14, color: c.muted }}>{dateTime(p.paidAt)}</Text>

      <Section style={{ backgroundColor: "#fdf7c3", borderRadius: 18, padding: 14, marginBottom: 18 }}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              {p.coverUrl && (
                <td width={52} style={{ paddingRight: 12, verticalAlign: "middle" }}>
                  <Img src={p.coverUrl} width={52} height={65} alt="" style={{ borderRadius: 8, display: "block" }} />
                </td>
              )}
              <td style={{ verticalAlign: "middle", fontSize: 15, fontWeight: 700, lineHeight: "21px", color: c.ink }}>{p.productTitle}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <Row2 label="Client" value={p.customerName} />
          <Row2 label="Email" value={p.customerEmail} />
          {p.customerPhone && <Row2 label="WhatsApp" value={p.customerPhone} />}
          {p.method && <Row2 label="Paiement" value={p.method} />}
          {p.couponCode && <Row2 label="Code promo" value={p.couponCode} />}
          {p.source && <Row2 label="Source" value={p.source} />}
          {p.fees !== undefined && <Row2 label="Frais Moneroo" value={`-${fcfa(p.fees)}`} />}
          {p.fees !== undefined && <Row2 label="Tes revenus" value={fcfa(p.net - p.fees)} strong />}
        </tbody>
      </table>

      <Section style={{ marginTop: 24 }}>
        <CtaButton tone="brand" href={p.dashboardUrl}>
          Voir la vente
        </CtaButton>
      </Section>
    </EmailShell>
  );
}

SellerSaleEmail.PreviewProps = {
  store: { storeName: "Mon Espace Digital", siteUrl: "https://boutique.exemple.com" },
  productTitle: "Guide complet de l'élevage de poulets",
  coverUrl: "https://placehold.co/208x260/1e3a2f/f8cb3c/png?text=GUIDE",
  customerName: "Moukaïla Soule",
  customerEmail: "moukaila@example.com",
  customerPhone: "+2290157885090",
  net: 2500,
  fees: 200,
  method: "MTN MoMo",
  source: "Facebook",
  paidAt: Date.UTC(2026, 9, 2, 9, 15),
  dashboardUrl: "https://boutique.exemple.com/admin/ventes",
} satisfies SellerSaleEmailProps;
