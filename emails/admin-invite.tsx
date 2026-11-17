import { Heading, Section, Text } from "@react-email/components";
import { CtaButton, EmailShell, type StoreInfo } from "./components/shell";
import { c } from "./components/theme";

export type AdminInviteProps = { store: StoreInfo; email: string; tempPassword: string; invitedBy: string; loginUrl: string };

/** Invitation d'un administrateur : identifiants temporaires, à changer dès la 1re connexion. */
export default function AdminInviteEmail(p: AdminInviteProps) {
  return (
    <EmailShell preview={`Ton accès administrateur à ${p.store.storeName}`} store={p.store} footerNote="Tu reçois cet email parce qu'un administrateur t'a ajouté. Si tu ne t'y attendais pas, ignore-le.">
      <Heading as="h1" style={{ margin: 0, fontSize: 24, lineHeight: "30px", color: c.ink }}>
        Ton accès au dashboard
      </Heading>
      <Text style={{ margin: "12px 0 0", fontSize: 15, lineHeight: "24px", color: c.ink }}>
        {p.invitedBy} t&apos;a ajouté comme administrateur. Connecte-toi avec ces identifiants, puis change ton mot de passe dans « Mon compte ».
      </Text>
      <Section style={{ margin: "20px 0", padding: "14px 16px", borderRadius: 16, backgroundColor: "#f3f4f3" }}>
        <Text style={{ margin: 0, fontSize: 13, color: c.muted }}>Email</Text>
        <Text style={{ margin: "2px 0 10px", fontSize: 16, fontWeight: 600, color: c.ink }}>{p.email}</Text>
        <Text style={{ margin: 0, fontSize: 13, color: c.muted }}>Mot de passe temporaire</Text>
        <Text style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 700, letterSpacing: "0.04em", fontFamily: "monospace", color: c.ink }}>{p.tempPassword}</Text>
      </Section>
      <CtaButton tone="brand" href={p.loginUrl}>
        Me connecter →
      </CtaButton>
    </EmailShell>
  );
}
