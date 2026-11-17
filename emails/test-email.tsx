import { Heading, Text } from "@react-email/components";
import { EmailShell, type StoreInfo } from "./components/shell";
import { c } from "./components/theme";

export default function TestEmail({ store }: { store: StoreInfo }) {
  return (
    <EmailShell preview="Tes emails partent bien ✅" store={store}>
      <Heading as="h1" style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 700, color: c.ink }}>
        Ça marche ✅
      </Heading>
      <Text style={{ margin: 0, fontSize: 16, lineHeight: "25px", color: c.text }}>
        Les emails de {store.storeName} partent correctement. Tes clients recevront leur lien d&apos;accès juste après le paiement.
      </Text>
    </EmailShell>
  );
}

TestEmail.PreviewProps = { store: { storeName: "Mon Espace Digital", siteUrl: "https://boutique.exemple.com" } };
