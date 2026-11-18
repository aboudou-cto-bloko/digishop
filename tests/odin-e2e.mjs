// Test de bout en bout de la liaison OdiN, contre une base Convex auto-hébergée (voir .github/workflows/test-odin.yml).
// Données de test seulement : compte test@example.com, boutique « test », fausse vente.
import { execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";

const SITE = process.env.SITE ?? "http://127.0.0.1:3211";
let failures = 0;
const ok = (cond, label, extra) => {
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}${extra !== undefined && !cond ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
  if (!cond) failures++;
};
const cx = (...args) => execFileSync("npx", ["convex", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const run = (fn, args) => JSON.parse(cx("run", fn, JSON.stringify(args)).trim() || "null");
const importRows = (table, rows) => {
  const file = `/tmp/${table}.jsonl`;
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  cx("import", "--table", table, "--append", "--format", "jsonLines", "-y", file);
};
const table = (name) => JSON.parse(cx("data", name, "--format", "jsonArray", "--limit", "100"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Récepteur de webhooks (vérifie la signature comme le feront OdiN et connexA) ──
const SECRET = "whsec_test_" + randomBytes(8).toString("hex");
const received = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const ts = req.headers["x-chairow-timestamp"];
    const sig = req.headers["x-chairow-signature"];
    const expected = "sha256=" + createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
    received.push({ event: req.headers["x-chairow-event"], valid: sig === expected, body: JSON.parse(body) });
    res.writeHead(200).end("ok");
  });
});
await new Promise((r) => server.listen(4545, "127.0.0.1", r));
const waitFor = async (event, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = received.find((r) => r.event === event);
    if (hit) return hit;
    await sleep(500);
  }
  return null;
};

// ── Données de départ ──
importRows("users", [{ email: "test@example.com", name: "Test OdiN" }]);
const user = table("users").find((u) => u.email === "test@example.com");
importRows("stores", [{ name: "Boutique test", slug: "test", status: "active", createdAt: Date.now(), ownerId: user._id }]);
const store = table("stores").find((s) => s.slug === "test");
importRows("webhooks", [
  { ownerId: user._id, url: "http://127.0.0.1:4545/hook", secret: SECRET, events: ["sale.paid", "sale.failed", "sale.abandoned", "sale.refunded"], active: true, createdAt: Date.now() },
]);
// Deuxième propriétaire : sa clé ne doit JAMAIS voir la boutique du premier
importRows("users", [{ email: "autre@example.com", name: "Autre" }]);
const other = table("users").find((u) => u.email === "autre@example.com");

const newKey = (ownerId) => {
  const key = "chw_" + randomBytes(32).toString("base64url");
  run("odin:insertKey", { ownerId, label: "test", hash: createHash("sha256").update(key).digest("hex"), prefix: key.slice(0, 10) });
  return key;
};
const KEY = newKey(user._id);
const OTHER_KEY = newKey(other._id);

const api = async (method, path, body, key = KEY) => {
  const res = await fetch(`${SITE}/api/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* vide */
  }
  return { status: res.status, json };
};
const upload = async (bytes, type) => {
  const { json } = await api("POST", "upload-url");
  const res = await fetch(json.upload_url, { method: "POST", headers: { "Content-Type": type }, body: bytes });
  return (await res.json()).storageId;
};

// ── Authentification ──
ok((await api("GET", "me", null, "chw_mauvaise_cle_abcdefghijklmnopqrstuvwxyz")).status === 401, "clé inconnue refusée (401)");
ok((await fetch(`${SITE}/api/v1/me`)).status === 401, "sans clé refusé (401)");
const me = await api("GET", "me");
ok(me.status === 200 && me.json.stores.length === 1 && me.json.stores[0].id === store._id, "GET /me liste la boutique", me);

// ── Fiche produit ──
const created = await api("POST", "products", { store_id: store._id, title: "Ebook prières du matin", tagline: "40 prières", price: 3000, compare_at_price: 7500 });
ok(created.status === 201 && created.json.status === "draft" && created.json.price === 3000, "création de fiche (brouillon, prix)", created);
const pid = created.json.id;
ok((await api("POST", "products", { store_id: store._id, title: "Intrus" }, OTHER_KEY)).status === 400, "autre compte : création dans cette boutique refusée");
ok((await api("GET", `products/${pid}`, null, OTHER_KEY)).status === 400, "autre compte : lecture de la fiche refusée");

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");
const gifId = await upload(GIF, "image/gif");
const fileId = await upload(Buffer.from("Contenu de l'ebook de test"), "text/plain");
ok(Boolean(gifId && fileId), "envoi d'un GIF et d'un fichier");
const link = await api("GET", `files/${gifId}`);
ok(link.status === 200 && String(link.json?.url).includes("/api/storage/"), "lien public d'un fichier envoyé", link);

const upd = await api("POST", `products/${pid}`, {
  description: "<h2>Pourquoi ce guide</h2><p>Pour bien commencer la journée.</p>",
  gallery: [{ storageId: gifId, mime: "image/gif", width: 1, height: 1 }],
  cover_storage_id: gifId,
  files: [{ storageId: fileId, name: "ebook.txt", size: 26, mime: "text/plain" }],
  faq: [{ id: "f1", question: "Comment je reçois l'ebook ?", answer: "Tout de suite par e-mail." }],
  guarantee: { enabled: true, text: "Satisfait ou remboursé 30 jours" },
});
ok(upd.status === 200 && upd.json.gallery_count === 1 && upd.json.has_cover && upd.json.files.length === 1, "mise à jour : galerie GIF, image, fichier, FAQ", upd);
const badGallery = await api("POST", `products/${pid}`, { gallery: [{ storageId: fileId, mime: "image/gif" }] });
ok(badGallery.status === 400, "galerie : un fichier qui n'est pas une image est refusé", badGallery);
ok((await api("POST", `products/${pid}`, { price: 50 })).status === 400, "prix sous 200 F refusé");

const pub = await api("POST", `products/${pid}/publish`);
ok(pub.status === 200 && pub.json.status === "published" && pub.json.url.includes("/p/"), "publication + lien public", pub);
const storeId = pub.json.store_id;
const paused = await api("POST", `stores/${storeId}/pause`);
ok(paused.status === 200 && paused.json.status === "paused", "boutique mise en pause par l'API", paused);
await api("POST", `products/${pid}/unpublish`);
const repub = await api("POST", `products/${pid}/publish`);
ok(repub.status === 200 && repub.json.store_activated === true && repub.json.store_status === "active", "publier un produit ouvre la boutique en pause", repub);
const act = await api("POST", `stores/${storeId}/activate`);
ok(act.status === 200 && act.json.status === "active", "boutique ouverte par l'API", act);

// ── Vente : réglée → webhook signé ──
const pending = run("sales:createPending", {
  productId: pid,
  name: "Awa Test",
  email: "awa@example.com",
  phone: "+22961000000",
  context: { country: "BJ", fbp: "fb.1.123.456", ip: "41.0.0.1", userAgent: "Test", utmCampaign: "camp_test" },
});
ok(Boolean(pending?.saleId), "vente en attente créée", pending);
run("sales:markPaid", { saleId: pending.saleId, method: "Test" });
const paid = await waitFor("sale.paid");
ok(Boolean(paid), "webhook sale.paid reçu");
ok(paid?.valid === true, "signature HMAC valide");
ok(paid?.body?.data?.amount === 3000 && paid?.body?.data?.customer?.phone === "+22961000000", "contenu de la vente (montant, téléphone)", paid?.body);
ok(paid?.body?.data?.fbp === "fb.1.123.456" && paid?.body?.data?.purchase_event_id === `purchase_${pending.saleId}`, "données pour connexA (fbp, event_id)", paid?.body);

const product = await api("GET", `products/${pid}`);
ok(product.json?.sales_count === 1, "compteur de ventes à 1", product);

const sales = await api("GET", `sales?store_id=${store._id}&status=paid`);
ok(sales.status === 200 && sales.json.data.length === 1, "GET /sales (réglées)", sales);
ok((await api("GET", `sales?store_id=${store._id}`, null, OTHER_KEY)).status === 400, "autre compte : ventes refusées");

// ── Abandon → webhook ──
const pending2 = run("sales:createPending", { productId: pid, name: "Koffi Test", email: "koffi@example.com", phone: "+22962000000", context: {} });
run("sales:markAbandonedIfPending", { saleId: pending2.saleId });
ok(Boolean(await waitFor("sale.abandoned")), "webhook sale.abandoned reçu (relance)");

// ── Remboursement par l'API ──
const refund = await api("POST", `sales/${pending.saleId}/refund`, { reason: "test" });
ok(refund.status === 200 && refund.json.status === "refunded", "remboursement par l'API", refund);
ok(Boolean(await waitFor("sale.refunded")), "webhook sale.refunded reçu");
ok((await api("POST", `sales/${pending.saleId}/refund`, {})).status === 400, "double remboursement refusé");

server.close();
console.log(failures ? `\n${failures} test(s) en échec` : "\nTous les tests sont passés");
process.exit(failures ? 1 : 0);
