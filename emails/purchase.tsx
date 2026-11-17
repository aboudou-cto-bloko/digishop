import { Heading, Img, Link, Section, Text } from "@react-email/components";
import { CtaButton, EmailShell, Row2, type StoreInfo } from "./components/shell";
import { c, dateTime, fcfa, fileSize, waLink } from "./components/theme";

export type PurchaseEmailProps = {
  store: StoreInfo;
  customerName: string;
  productTitle: string;
  coverUrl?: string | null;
  files: { name: string; size: number }[];
  number: string;
  paidAt: number;
  price: number;
  discount: number;
  couponCode?: string;
  net: number;
  method?: string;
  accessUrl: string;
  supportWhatsapp?: string;
  supportEmail?: string;
};

export function purchaseSubject(p: Pick<PurchaseEmailProps, "productTitle">) {
  return `Ton accès est prêt : ${p.productTitle}`;
}

/** Email envoyé au client après paiement : son lien d'accès, le récapitulatif, l'aide. */
export default function PurchaseEmail(p: PurchaseEmailProps) {
  const first = p.customerName.trim().split(/\s+/)[0] ?? "";
  return (
    <EmailShell
      preview={`Merci ${first} ! Télécharge « ${p.productTitle} » dès maintenant.`}
      store={p.store}
      footerNote={`Tu reçois cet email suite à ta commande #${p.number}. Garde-le : ton lien d'accès reste valable.`}
    >
      <Text style={{ margin: 0 }}>
        <span style={{ display: "inline-block", backgroundColor: c.successBg, color: c.successFg, fontSize: 13, fontWeight: 700, borderRadius: 999, padding: "6px 12px" }}>
          ✓ Paiement confirmé
        </span>
      </Text>
      <Heading as="h1" style={{ margin: "18px 0 8px", fontSize: 28, lineHeight: "34px", fontWeight: 700, letterSpacing: "-0.02em", color: c.ink }}>
        Merci {first} ! 🎉
      </Heading>
      <Text style={{ margin: "0 0 24px", fontSize: 16, lineHeight: "25px", color: c.text }}>
        Ton produit est prêt. Clique sur le bouton ci-dessous pour le télécharger, sur ton téléphone ou ton ordinateur.
      </Text>

      {/* Carte produit */}
      <Section style={{ backgroundColor: c.surface, borderRadius: 18, padding: 14, marginBottom: 20 }}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              {p.coverUrl && (
                <td width={68} style={{ verticalAlign: "top", paddingRight: 14 }}>
                  <Img src={p.coverUrl} width={68} height={85} alt="" style={{ borderRadius: 10, objectFit: "cover", display: "block" }} />
                </td>
              )}
              <td style={{ verticalAlign: "middle" }}>
                <Text style={{ margin: 0, fontSize: 16, lineHeight: "22px", fontWeight: 700, color: c.ink }}>{p.productTitle}</Text>
                <Text style={{ margin: "4px 0 0", fontSize: 13, color: c.muted }}>
                  {p.files.length} fichier{p.files.length > 1 ? "s" : ""} · accès à vie
                </Text>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <CtaButton href={p.accessUrl}>Accéder à mon produit →</CtaButton>
      <Text style={{ margin: "12px 0 0", fontSize: 12, lineHeight: "18px", color: c.muted, textAlign: "center" }}>
        Le bouton ne marche pas ? Copie ce lien :<br />
        <Link href={p.accessUrl} style={{ color: c.muted, wordBreak: "break-all" }}>
          {p.accessUrl}
        </Link>
      </Text>

      {p.files.length > 0 && (
        <Section style={{ marginTop: 28 }}>
          <Text style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: c.muted }}>Inclus dans ton achat</Text>
          <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
            <tbody>
              {p.files.map((f, i) => (
                <tr key={i}>
                  <td style={{ padding: "10px 0", borderTop: i ? `1px solid ${c.border}` : "none", fontSize: 14, color: c.ink }}>📄 {f.name}</td>
                  <td style={{ padding: "10px 0", borderTop: i ? `1px solid ${c.border}` : "none", fontSize: 13, color: c.muted, textAlign: "right", whiteSpace: "nowrap" }}>{fileSize(f.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Récapitulatif */}
      <Section style={{ marginTop: 24, borderTop: `1px solid ${c.border}`, paddingTop: 12 }}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <Row2 label="Commande" value={`#${p.number}`} />
            <Row2 label="Date" value={dateTime(p.paidAt)} />
            {p.discount > 0 && <Row2 label="Prix" value={fcfa(p.price)} />}
            {p.discount > 0 && <Row2 label={p.couponCode ? `Réduction (${p.couponCode})` : "Réduction"} value={`-${fcfa(p.discount)}`} />}
            {p.method && <Row2 label="Moyen de paiement" value={p.method} />}
            <Row2 label="Total payé" value={fcfa(p.net)} strong />
          </tbody>
        </table>
      </Section>

      {(p.supportWhatsapp || p.supportEmail) && (
        <Section style={{ marginTop: 26, backgroundColor: c.surface, borderRadius: 18, padding: "18px 18px 20px" }}>
          <Text style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: c.ink }}>Besoin d&apos;aide ?</Text>
          <Text style={{ margin: "0 0 14px", fontSize: 14, lineHeight: "21px", color: c.text }}>
            Un souci de téléchargement ou une question sur le contenu ? {p.supportEmail ? "Réponds simplement à cet email" : "Écris-nous"}
            {p.supportWhatsapp ? ", ou contacte-nous sur WhatsApp." : "."}
          </Text>
          {p.supportWhatsapp && (
            <CtaButton tone="whatsapp" href={waLink(p.supportWhatsapp, `Bonjour, j'ai une question sur ma commande #${p.number}.`)}>
              Écrire sur WhatsApp
            </CtaButton>
          )}
        </Section>
      )}
    </EmailShell>
  );
}

PurchaseEmail.PreviewProps = {
  store: {
    storeName: "Mon Espace Digital",
    siteUrl: "https://boutique.exemple.com",
    legalLinks: [
      { title: "CGV", url: "https://boutique.exemple.com/pages/cgv" },
      { title: "Remboursement", url: "https://boutique.exemple.com/pages/remboursement" },
    ],
  },
  customerName: "Moukaïla Soule",
  productTitle: "Guide complet de l'élevage de poulets",
  coverUrl: "https://placehold.co/272x340/1e3a2f/f8cb3c/png?text=GUIDE",
  files: [
    { name: "guide-elevage.pdf", size: 4_200_000 },
    { name: "fiches-pratiques.pdf", size: 820_000 },
  ],
  number: "SALEY1AFYGFFPHB9CPV",
  paidAt: Date.UTC(2026, 9, 2, 9, 15),
  price: 2500,
  discount: 500,
  couponCode: "LANCEMENT",
  net: 2000,
  method: "MTN MoMo",
  accessUrl: "https://boutique.exemple.com/merci/abc?k=xyz",
  supportWhatsapp: "+229 01 57 88 50 90",
  supportEmail: "support@exemple.com",
} satisfies PurchaseEmailProps;
