import { Body, Container, Font, Head, Html, Img, Link, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";
import { c, font } from "./theme";
import { BRAND } from "../../convex/lib/brand";

export type StoreInfo = {
  storeName: string;
  logoUrl?: string | null;
  siteUrl: string;
  legalLinks?: { title: string; url: string }[];
};

/** Gabarit commun : fond gris, carte blanche arrondie, en-tête marque, pied de page. */
export function EmailShell({ preview, store, footerNote, children }: { preview: string; store: StoreInfo; footerNote?: string; children: ReactNode }) {
  return (
    <Html lang="fr" dir="ltr">
      <Head>
        {/* Outfit, comme la boutique (Apple Mail, iOS) ; repli Helvetica/Arial ailleurs */}
        <Font
          fontFamily="Outfit"
          fallbackFontFamily={["Helvetica", "Arial"]}
          webFont={{ url: "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4E.ttf", format: "truetype" }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Outfit"
          fallbackFontFamily={["Helvetica", "Arial"]}
          webFont={{ url: "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4deyC4E.ttf", format: "truetype" }}
          fontWeight={700}
          fontStyle="normal"
        />
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: c.bg, fontFamily: font, color: c.ink }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "28px 14px 36px" }}>
          <Section style={{ padding: "0 6px 18px" }}>
            <Link href={store.siteUrl} style={{ textDecoration: "none", color: c.ink }}>
              <table role="presentation" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    {store.logoUrl ? (
                      <td style={{ paddingRight: 10, verticalAlign: "middle" }}>
                        <Img src={store.logoUrl} width={36} height={36} alt="" style={{ borderRadius: 10, display: "block" }} />
                      </td>
                    ) : (
                      <td style={{ paddingRight: 10, verticalAlign: "middle" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.ink, color: c.brand, fontSize: 18, fontWeight: 700, lineHeight: "36px", textAlign: "center" }}>
                          {store.storeName.slice(0, 1).toUpperCase()}
                        </div>
                      </td>
                    )}
                    <td style={{ verticalAlign: "middle", fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em" }}>{store.storeName}</td>
                  </tr>
                </tbody>
              </table>
            </Link>
          </Section>

          <Section style={{ backgroundColor: c.card, borderRadius: 24, padding: "32px 28px" }}>{children}</Section>

          <Section style={{ padding: "22px 10px 0", textAlign: "center" }}>
            {footerNote && <Text style={{ margin: "0 0 8px", fontSize: 12, lineHeight: "18px", color: c.muted }}>{footerNote}</Text>}
            {store.legalLinks && store.legalLinks.length > 0 && (
              <Text style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: c.muted }}>
                {store.legalLinks.map((l, i) => (
                  <span key={l.url}>
                    {i > 0 && " · "}
                    <Link href={l.url} style={{ color: c.muted, textDecoration: "underline" }}>
                      {l.title}
                    </Link>
                  </span>
                ))}
              </Text>
            )}
            <Text style={{ margin: "8px 0 0", fontSize: 12, color: c.muted }}>
              © {new Date().getFullYear()} {store.storeName} · propulsé par {BRAND.name}
            </Text>
            <Text style={{ margin: "4px 0 0", fontSize: 11, color: c.muted }}>{BRAND.disclaimer}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/** Bouton « bulletproof » (lien stylé en bloc, compatible Outlook/Gmail). */
export function CtaButton({ href, children, tone = "ink" }: { href: string; children: ReactNode; tone?: "ink" | "brand" | "whatsapp" }) {
  const bg = tone === "ink" ? c.ink : tone === "brand" ? c.brand : c.whatsapp;
  const fg = tone === "ink" ? "#ffffff" : c.ink;
  return (
    <Link
      href={href}
      style={{
        display: "block",
        backgroundColor: bg,
        color: tone === "whatsapp" ? "#ffffff" : fg,
        textDecoration: "none",
        textAlign: "center",
        fontWeight: 700,
        fontSize: 16,
        lineHeight: "22px",
        padding: "16px 20px",
        borderRadius: 16,
        fontFamily: font,
      }}
    >
      {children}
    </Link>
  );
}

export function Row2({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <tr>
      <td style={{ padding: "8px 0", fontSize: 14, color: c.muted }}>{label}</td>
      <td style={{ padding: "8px 0", fontSize: strong ? 16 : 14, fontWeight: strong ? 700 : 600, color: c.ink, textAlign: "right" }}>{value}</td>
    </tr>
  );
}
