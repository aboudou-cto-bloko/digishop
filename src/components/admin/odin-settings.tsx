"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { errorMessage, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStoreMutation, useStoreQuery } from "@/hooks/use-current-store";

const inputCls = "h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus:ring-2 focus:ring-foreground/10";
const btnCls = "inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold hover:bg-[#eceeec] disabled:opacity-60";

const EVENTS = [
  { id: "sale.paid", label: "Vente réglée" },
  { id: "sale.failed", label: "Paiement échoué" },
  { id: "sale.abandoned", label: "Paiement abandonné" },
  { id: "sale.refunded", label: "Vente remboursée" },
];

function Block({ id, title, desc, children }: { id: string; title: string; desc: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr] [&>*]:min-w-0">
        <div>
          <h2 className="font-heading text-[1.9rem] leading-tight">{title}</h2>
          <div className="mt-2 text-[0.95rem] text-muted-foreground">{desc}</div>
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </section>
  );
}

function Copyable({ value, label = "Copié" }: { value: string; label?: string }) {
  return (
    <div className="flex h-12 items-center gap-1 rounded-xl border border-border bg-surface pl-4 pr-1">
      <span className="flex-1 truncate font-mono text-sm">{value}</span>
      <button type="button" onClick={() => navigator.clipboard.writeText(value).then(() => toast.success(label))} className="flex size-10 items-center justify-center rounded-lg hover:bg-card" aria-label="Copier">
        <Copy className="size-4" />
      </button>
    </div>
  );
}

/** Connexion OdiN : clés d'API + webhook signé. Valable pour toutes les boutiques du compte. */
export function OdinSection() {
  const keys = useQuery(api.odin.listKeys, {});
  const hook = useQuery(api.odin.getWebhook, {});
  const createKey = useAction(api.odin.createKey);
  const revokeKey = useMutation(api.odin.revokeKey);
  const saveWebhook = useMutation(api.odin.saveWebhook);
  const testWebhook = useMutation(api.odin.testWebhook);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(EVENTS.map((e) => e.id));
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!hook) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- formulaire initialisé une fois les données reçues
    setUrl(hook.url);
    setEvents(hook.events);
    setActive(hook.active);
  }, [hook]);

  const apiBase = `${(process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "").replace(/\/$/, "")}/api/v1`;

  const onCreate = async () => {
    setBusy(true);
    try {
      const { key } = await createKey({ label: "OdiN" });
      setFresh(key);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onSaveHook = async (newSecret = false) => {
    try {
      await saveWebhook({ url, events, active, newSecret });
      toast.success(newSecret ? "Nouveau secret généré : mets-le à jour dans OdiN" : "Webhook enregistré");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Block
      id="odin"
      title="OdiN"
      desc={
        <>
          Relie Chairow à OdiN : OdiN crée et remplit les pages de vente, lit les ventes et reçoit chaque paiement réglé, échoué, abandonné ou remboursé.
          La clé d&apos;API donne accès à <strong>toutes tes boutiques</strong> : ne la colle que dans OdiN.
        </>
      }
    >
      <div className="space-y-2">
        <span className="block font-semibold">Adresse de l&apos;API</span>
        <Copyable value={apiBase} label="Adresse copiée" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">Clés d&apos;API</span>
          <button type="button" onClick={onCreate} disabled={busy} className={btnCls}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Créer une clé
          </button>
        </div>
        {fresh && (
          <div className="space-y-2 rounded-2xl bg-[#fdf7c3] p-4">
            <p className="text-sm font-semibold">Copie cette clé maintenant : elle ne sera plus jamais affichée.</p>
            <Copyable value={fresh} label="Clé copiée" />
            <button type="button" onClick={() => setFresh(null)} className="text-sm font-semibold underline underline-offset-4">
              C&apos;est fait
            </button>
          </div>
        )}
        {keys?.length === 0 && !fresh && <p className="text-sm text-muted-foreground">Aucune clé pour l&apos;instant.</p>}
        {keys?.map((k) => (
          <div key={k._id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 pl-4">
            <KeyRound className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm">{k.prefix}…</div>
              <div className="text-xs text-muted-foreground">
                Créée le {fmtDateTime(k.createdAt)}
                {k.lastUsedAt ? ` · utilisée le ${fmtDateTime(k.lastUsedAt)}` : " · jamais utilisée"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => revokeKey({ id: k._id as Id<"apiKeys"> }).then(() => toast.success("Clé révoquée"), (e) => toast.error(errorMessage(e)))}
              className="flex size-10 items-center justify-center rounded-lg text-[#b42318] hover:bg-card"
              aria-label="Révoquer la clé"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <span className="block font-semibold">Webhook (adresse donnée par OdiN)</span>
        <input value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://odin…/api/chairow" className={inputCls} inputMode="url" />
        <div className="flex flex-wrap gap-2">
          {EVENTS.map((e) => {
            const on = events.includes(e.id);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setEvents((cur) => (on ? cur.filter((x) => x !== e.id) : [...cur, e.id]))}
                className={cn("inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium", on ? "bg-foreground text-background" : "bg-surface")}
                aria-pressed={on}
              >
                {on && <Check className="size-4" />} {e.label}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-foreground" />
          Envoi actif
        </label>
        {hook && (
          <div className="space-y-2">
            <span className="block text-sm font-semibold">Secret de signature (à coller dans OdiN)</span>
            <Copyable value={hook.secret} label="Secret copié" />
            <p className="text-xs text-muted-foreground">
              Dernier envoi : {hook.lastAt ? `${fmtDateTime(hook.lastAt)} · ${hook.lastStatus ?? ""}` : "aucun"}
            </p>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {hook && (
            <>
              <button type="button" onClick={() => testWebhook({}).then(() => toast.success("Test envoyé"), (e) => toast.error(errorMessage(e)))} className={btnCls}>
                <Send className="size-4" /> Envoyer un test
              </button>
              <button type="button" onClick={() => onSaveHook(true)} className={btnCls}>
                Nouveau secret
              </button>
            </>
          )}
          <button type="button" onClick={() => onSaveHook(false)} disabled={!url} className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-50">
            Enregistrer
          </button>
        </div>
      </div>
    </Block>
  );
}

type PixelRow = { pixelId: string; label: string; token: string; hasToken: boolean };

/** Pixels Facebook supplémentaires : un par compte publicitaire (chaque membre de l'équipe OdiN). */
export function ExtraPixels() {
  const saved = useStoreQuery(api.settings.extraPixels, {});
  const save = useStoreMutation(api.settings.saveExtraPixels);
  const [rows, setRows] = useState<PixelRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!saved || rows) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- formulaire initialisé une fois les données reçues
    setRows(saved.map((p) => ({ pixelId: p.pixelId, label: p.label, token: "", hasToken: p.hasToken })));
  }, [saved, rows]);

  if (!rows) return null;
  const set = (i: number, patch: Partial<PixelRow>) => setRows((r) => (r ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const onSave = async () => {
    setSaving(true);
    try {
      await save({
        pixels: rows
          .filter((r) => r.pixelId.trim())
          .map((r) => ({ pixelId: r.pixelId.trim(), label: r.label, accessToken: r.token.trim() ? r.token.trim() : undefined })),
      });
      toast.success("Pixels enregistrés");
      setRows(rows.map((r) => ({ ...r, token: "", hasToken: r.hasToken || Boolean(r.token.trim()) })));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-3xl bg-surface p-4 sm:p-5">
      <div>
        <span className="block font-semibold">Pixels supplémentaires</span>
        <span className="block text-sm text-muted-foreground">
          Chaque pixel reçoit les mêmes évènements (visite, début de paiement, achat). Ajoute le jeton API Conversions pour que l&apos;achat parte aussi depuis le serveur.
        </span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="space-y-2 rounded-2xl bg-card p-3">
          <div className="flex gap-2">
            <input value={r.pixelId} onChange={(e) => set(i, { pixelId: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="ID du pixel" className={inputCls} />
            <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="flex size-12 shrink-0 items-center justify-center rounded-xl text-[#b42318] hover:bg-surface" aria-label="Retirer ce pixel">
              <Trash2 className="size-4" />
            </button>
          </div>
          <input value={r.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Nom (ex. compte pub de Junior)" className={inputCls} />
          <input
            value={r.token}
            onChange={(e) => set(i, { token: e.target.value })}
            type="password"
            autoComplete="off"
            placeholder={r.hasToken ? "Jeton enregistré (laisser vide pour le garder)" : "Jeton API Conversions (facultatif)"}
            className={inputCls}
          />
        </div>
      ))}
      <div className="flex flex-wrap justify-between gap-2">
        <button type="button" onClick={() => setRows([...rows, { pixelId: "", label: "", token: "", hasToken: false }])} disabled={rows.length >= 10} className={btnCls}>
          <Plus className="size-4" /> Ajouter un pixel
        </button>
        <button type="button" onClick={onSave} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-60">
          {saving && <Loader2 className="size-4 animate-spin" />} Enregistrer les pixels
        </button>
      </div>
    </div>
  );
}
