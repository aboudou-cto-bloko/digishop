import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import { StoreHome } from "@/components/store/layouts";
import { JsonLd, itemListJsonLd, storeJsonLd } from "@/lib/seo";
import { getStore } from "@/lib/store-context";

export default async function StoreHomePage() {
  const store = await getStore();
  const [settings, products] = await Promise.all([
    fetchQuery(api.settings.publicSettings, { storeId: store._id }),
    fetchQuery(api.products.listPublished, { storeId: store._id }),
  ]);
  // Rendu serveur à la demande : l'heure sert aux promos programmées
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <>
      <JsonLd data={[...storeJsonLd(settings, store.url), itemListJsonLd(products, store.url)]} />
      <StoreHome settings={settings} theme={settings.theme} products={products} now={now} base={store.base} />
    </>
  );
}
