"use client";

import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { Check, Eye, Loader2, Mail, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Money, StatCard } from "@/components/admin/ui";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { errorMessage, fcfa, fmtDateTime, waLink } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStoreQuery, useStoreMutation, useStoreAction, useCurrentStore } from "@/hooks/use-current-store";
import { WhatsAppIcon } from "@/components/shared/whatsapp-icon";

type Config = FunctionReturnType<typeof api.recovery.getConfig>;
type Step = Config["steps"][number];
type Unit = Step["unit"];

const UNITS: { value: Unit; label: string }[] = [
  { value: "minutes", label: "minutes" },
  { value: "hours", label: "heures" },
  { value: "days", label: "jours" },
];
const VARS = ["{prénom}", "{produit}", "{prix}", "{code}", "{expiration}"];
const uid = () => Math.random().toString(36).slice(2, 8);

export default function AutomationsPage() {
  const config = useStoreQuery(api.recovery.getConfig, {});
  if (!config) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 rounded-3xl" />
      </div>
    );
  }
  return <Editor initial={config} />;
}

function Editor({ initial }: { initial: Config }) {
  const save = useStoreMutation(api.recovery.saveConfig);
  const stats = useStoreQuery(api.recovery.stats, {});
  const coupons = useStoreQuery(api.coupons.list, {});
  const [cfg, setCfg] = useState<Config>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(cfg) !== saved;
  const setStep = (id: string, patch: Partial<Step>) => setCfg((c) => ({ ...c, steps: c.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const onSave = async (next = cfg) => {
    setSaving(true);
    try {
      await save({ config: next });
      setSaved(JSON.stringify(next));
      toast.success("Séquence enregistrée");
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl pb-28">
      <h1 className="font-heading text-4xl">Automatisations</h1>
      <p className="mt-1 text-[0.95rem] text-muted-foreground">
        Récupère les ventes perdues : ceux qui ont commencé à payer sans aller au bout reçoivent des rappels, au rythme et avec les promotions que tu choisis.
      </p>

      <div className="mt-6 flex items-start gap-4 rounded-[28px] bg-brand p-5 text-brand-foreground sm:p-6">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-card/70 text-foreground">
          <Zap className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Relance des paniers abandonnés</h2>
          <p className="text-sm opacity-80">{cfg.enabled ? "Active : les emails partent automatiquement." : "Désactivée : aucun email n'est envoyé."}</p>
        </div>
        <Switch
          checked={cfg.enabled}
          onCheckedChange={async (v) => {
            const next = { ...cfg, enabled: v };
            setCfg(next);
            await onSave(next);
          }}
          aria-label="Activer la relance"
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard value={stats ? stats.sent : "…"} label="Relances envoyées" hint="Emails de relance délivrés sur les 30 derniers jours." />
        <StatCard
          value={stats ? stats.opened : "…"}
          label="Ouvertes"
          hint={
            stats?.sent
              ? `${Math.round((stats.opened / stats.sent) * 100)} % des relances envoyées. Approximatif : certaines messageries bloquent les images.`
              : "Mesuré par un pixel invisible dans l'email."
          }
        />
        <StatCard
          value={stats ? stats.clicked : "…"}
          label="Cliquées"
          hint={stats?.sent ? `${Math.round((stats.clicked / stats.sent) * 100)} % ont cliqué « Finaliser ma commande ».` : "Clics sur « Finaliser ma commande »."}
        />
        <StatCard value={stats ? stats.recoveredCount : "…"} label="Ventes récupérées" hint="Ventes réglées après au moins une relance (30 jours)." />
        <StatCard value={stats ? <Money value={stats.recoveredRevenue} /> : "…"} label="Revenu récupéré" tone="green" />
      </div>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Séquence d&apos;emails</h2>
            <p className="text-sm text-muted-foreground">Les délais comptent depuis l&apos;abandon. Une relance s&apos;arrête dès que le client paie ou se désabonne.</p>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            Relancer pendant
            <input
              type="number"
              min={1}
              max={30}
              value={cfg.maxAgeDays}
              onChange={(e) => setCfg({ ...cfg, maxAgeDays: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
              className="h-11 w-16 rounded-xl border border-border px-2 text-center text-base"
            />
            jours max
          </label>
        </div>

        <ol className="relative space-y-4 border-l-2 border-dashed border-[#d4d7d4] pl-6 sm:pl-8">
          {cfg.steps.map((s, i) => (
            <li key={s.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[39px] top-5 flex size-8 items-center justify-center rounded-full text-sm font-bold sm:-left-[47px]",
                  s.enabled ? "bg-foreground text-background" : "bg-surface text-muted-foreground",
                )}
              >
                {i + 1}
              </span>
              <StepCard
                step={s}
                coupons={coupons ?? []}
                onChange={(patch) => setStep(s.id, patch)}
                onDelete={cfg.steps.length > 1 ? () => setCfg({ ...cfg, steps: cfg.steps.filter((x) => x.id !== s.id) }) : undefined}
              />
            </li>
          ))}
        </ol>
        {cfg.steps.length < 5 && (
          <button
            type="button"
            onClick={() => {
              const last = cfg.steps[cfg.steps.length - 1];
              setCfg({
                ...cfg,
                steps: [
                  ...cfg.steps,
                  {
                    id: uid(),
                    enabled: true,
                    delay: last ? last.delay + 1 : 1,
                    unit: last?.unit ?? "days",
                    subject: "{prénom}, on t'a gardé ta place",
                    message: "« {produit} » t'attend toujours. Finalise ta commande en une minute.",
                    promo: { kind: "none" },
                  },
                ],
              });
            }}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#d4d7d4] font-semibold hover:bg-surface"
          >
            <Plus className="size-4" /> Ajouter une relance
          </button>
        )}
      </section>

      <EmailQueue />

      <WhatsappAuto />

      <WhatsappQueue />

      <div
        className={cn(
          "fixed inset-x-0 bottom-[104px] z-30 flex justify-center px-4 transition lg:bottom-6 lg:pl-[272px]",
          dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <div className="flex w-full max-w-lg items-center gap-3 rounded-2xl bg-foreground p-2 pl-5 text-background shadow-2xl">
          <span className="flex-1 text-sm font-medium">Modifications non enregistrées</span>
          <button type="button" onClick={() => setCfg(JSON.parse(saved) as Config)} className="h-11 rounded-xl px-3 text-sm font-semibold text-background/80">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onSave()}
            disabled={saving}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-brand-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

function StepCard({
  step: s,
  coupons,
  onChange,
  onDelete,
}: {
  step: Step;
  coupons: { _id: Id<"coupons">; code: string; type: "percent" | "fixed"; value: number; active: boolean; saleId?: Id<"sales"> }[];
  onChange: (patch: Partial<Step>) => void;
  onDelete?: () => void;
}) {
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const promoKind = s.promo.kind;
  const manual = coupons.filter((c) => !c.saleId && c.active);

  const insertVar = (v: string) => {
    const el = messageRef.current;
    if (!el) return onChange({ message: `${s.message} ${v}` });
    const { selectionStart: a, selectionEnd: b } = el;
    onChange({ message: s.message.slice(0, a) + v + s.message.slice(b) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + v.length, a + v.length);
    });
  };

  return (
    <div className={cn("space-y-4 rounded-3xl border border-border bg-card p-5", !s.enabled && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">Envoyer</span>
        <input
          type="number"
          min={1}
          value={s.delay}
          onChange={(e) => onChange({ delay: Math.max(1, Number(e.target.value) || 1) })}
          className="h-11 w-20 rounded-xl border border-border px-2 text-center text-base font-semibold"
          aria-label="Délai"
        />
        <select
          value={s.unit}
          onChange={(e) => onChange({ unit: e.target.value as Unit })}
          className="h-11 rounded-xl border border-border bg-card px-3 text-base"
          aria-label="Unité"
        >
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
        <span className="font-semibold">après l&apos;abandon</span>
        <div className="ml-auto flex items-center gap-1">
          <Switch checked={s.enabled} onCheckedChange={(v) => onChange({ enabled: v })} aria-label="Activer cette relance" />
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
              aria-label="Supprimer la relance"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-semibold">Promotion</span>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
          {(
            [
              ["none", "Aucune"],
              ["unique", "Code unique"],
              ["existing", "Code existant"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() =>
                onChange({
                  promo:
                    k === "none"
                      ? { kind: "none" }
                      : k === "unique"
                        ? { kind: "unique", type: "percent", value: 10, validHours: 48 }
                        : manual[0]
                          ? { kind: "existing", couponId: manual[0]._id }
                          : s.promo,
                })
              }
              disabled={k === "existing" && manual.length === 0}
              title={k === "existing" && manual.length === 0 ? "Crée d'abord un code dans Réductions" : undefined}
              className={cn("h-10 rounded-lg text-sm font-semibold disabled:opacity-40", promoKind === k ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        {s.promo.kind === "unique" && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 text-sm">
            <span>Réduction de</span>
            <input
              type="number"
              min={1}
              value={s.promo.value}
              onChange={(e) => s.promo.kind === "unique" && onChange({ promo: { ...s.promo, value: Math.max(1, Number(e.target.value) || 1) } })}
              className="h-10 w-20 rounded-lg border border-border bg-card px-2 text-center text-base"
              aria-label="Valeur"
            />
            <select
              value={s.promo.type}
              onChange={(e) => s.promo.kind === "unique" && onChange({ promo: { ...s.promo, type: e.target.value as "percent" | "fixed" } })}
              className="h-10 rounded-lg border border-border bg-card px-2 text-base"
              aria-label="Type"
            >
              <option value="percent">%</option>
              <option value="fixed">F CFA</option>
            </select>
            <span>valable</span>
            <input
              type="number"
              min={1}
              value={s.promo.validHours}
              onChange={(e) => s.promo.kind === "unique" && onChange({ promo: { ...s.promo, validHours: Math.max(1, Number(e.target.value) || 1) } })}
              className="h-10 w-20 rounded-lg border border-border bg-card px-2 text-center text-base"
              aria-label="Validité en heures"
            />
            <span>heures, à usage unique.</span>
          </div>
        )}
        {s.promo.kind === "existing" && (
          <select
            value={s.promo.couponId}
            onChange={(e) => onChange({ promo: { kind: "existing", couponId: e.target.value as Id<"coupons"> } })}
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-base"
          >
            {manual.map((c) => (
              <option key={c._id} value={c._id}>
                {c.code} ({c.type === "percent" ? `-${c.value} %` : `-${fcfa(c.value)}`})
              </option>
            ))}
          </select>
        )}
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-semibold">Objet de l&apos;email</span>
        <input value={s.subject} onChange={(e) => onChange({ subject: e.target.value })} maxLength={120} className="h-12 w-full rounded-xl border border-border px-4 text-base" />
      </label>
      <div className="space-y-2">
        <span className="text-sm font-semibold">Message</span>
        <textarea
          ref={messageRef}
          value={s.message}
          onChange={(e) => onChange({ message: e.target.value })}
          rows={4}
          className="w-full rounded-xl border border-border px-4 py-3 text-base"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Insérer :</span>
          {VARS.map((v) => (
            <button key={v} type="button" onClick={() => insertVar(v)} className="h-8 rounded-lg bg-surface px-2 font-mono text-xs font-semibold hover:bg-[#eceeec]">
              {v}
            </button>
          ))}
        </div>
        {s.promo.kind === "none" && /\{code\}|\{expiration\}/.test(s.message + s.subject) && (
          <p className="text-xs text-[#92400e]">Ce message utilise {"{code}"} mais aucune promotion n&apos;est choisie : la variable sera vide.</p>
        )}
      </div>
      <PreviewButton step={s} coupons={coupons} />
    </div>
  );
}

function PreviewButton({ step, coupons }: { step: Step; coupons: { _id: Id<"coupons">; type: "percent" | "fixed"; value: number }[] }) {
  const preview = useStoreAction(api.email.send.previewRecovery);
  const [open, setOpen] = useState(false);
  const [mail, setMail] = useState<{ subject: string; html: string } | null>(null);
  const label =
    step.promo.kind === "unique"
      ? step.promo.type === "percent"
        ? `-${step.promo.value} % avec ton code`
        : `-${fcfa(step.promo.value)} avec ton code`
      : step.promo.kind === "existing"
        ? (() => {
            const id = step.promo.couponId;
            const c = coupons.find((x) => x._id === id);
            return c ? (c.type === "percent" ? `-${c.value} % avec ton code` : `-${fcfa(c.value)} avec ton code`) : undefined;
          })()
        : undefined;
  const load = async () => {
    setOpen(true);
    setMail(null);
    try {
      const r = await preview({
        subject: step.subject,
        message: step.message,
        promo: step.promo.kind === "none" ? "none" : "code",
        discountLabel: label,
        validHours: step.promo.kind === "unique" ? step.promo.validHours : undefined,
      });
      if (!r) {
        toast.message("Aucune vente pour générer l'aperçu : il apparaîtra après la première commande.");
        setOpen(false);
      } else setMail(r);
    } catch (e) {
      toast.error(errorMessage(e));
      setOpen(false);
    }
  };
  return (
    <>
      <button type="button" onClick={load} className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold hover:bg-[#eceeec]">
        <Eye className="size-4" /> Aperçu de l&apos;email
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[88dvh] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-[620px]">
          <div className="border-b border-border px-5 py-4 pr-14">
            <DialogTitle className="text-base">Aperçu de la relance</DialogTitle>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">Objet : {mail?.subject ?? "…"}</p>
          </div>
          {mail ? <iframe title="Aperçu" srcDoc={mail.html} sandbox="" className="w-full flex-1 bg-[#f3f4f3]" /> : <Skeleton className="m-6 flex-1 rounded-3xl" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

const STATUS_LABEL: Record<string, string> = { failed: "Paiement échoué", abandoned: "Abandonné", pending: "En attente" };

/** Envoi manuel d'emails (modèles) aux clients dont le paiement n'a pas abouti. */
function EmailQueue() {
  const rows = useStoreQuery(api.recovery.failedQueue, {});
  const templates = useStoreQuery(api.recovery.manualTemplates, {});
  const sendBulk = useStoreMutation(api.recovery.sendBulk);
  const waBulk = useStoreMutation(api.whatsapp.enqueueBulk);
  const waStatus = useStoreQuery(api.whatsapp.status, {});
  const [template, setTemplate] = useState<"failed" | "cart">("failed");
  const [picked, setPicked] = useState<Set<Id<"sales">>>(new Set());
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const sendable = (rows ?? []).filter((r) => !r.waitingUntil);
  const tpl = templates?.find((t) => t.key === template);
  const toggle = (id: Id<"sales">) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    setSending(true);
    try {
      const r = await sendBulk({ saleIds: [...picked], template });
      toast.success(
        `${r.sent} email${r.sent > 1 ? "s" : ""} envoyé${r.sent > 1 ? "s" : ""}${r.skipped.length ? ` · ${r.skipped.length} ignoré${r.skipped.length > 1 ? "s" : ""} (${r.skipped[0].reason})` : ""}`,
      );
      setPicked(new Set());
      setConfirming(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const sendWa = async () => {
    setSending(true);
    try {
      const r = await waBulk({ saleIds: [...picked], kind: template });
      toast.success(
        `${r.queued} message${r.queued > 1 ? "s" : ""} WhatsApp en file${r.skipped.length ? ` · ${r.skipped.length} ignoré${r.skipped.length > 1 ? "s" : ""} (${r.skipped[0]})` : ""}`,
      );
      setPicked(new Set());
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">Relancer par email maintenant</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Choisis un modèle puis les clients. Les clients désabonnés, déjà servis ou relancés il y a moins d&apos;une heure n&apos;apparaissent pas (ou sont ignorés). Chaque email
        contient un bouton qui reprend la commande.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
        {templates?.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTemplate(t.key)}
            className={cn("h-11 rounded-lg text-sm font-semibold", template === t.key ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tpl && (
        <div className="mb-4 rounded-2xl bg-surface p-4 text-sm">
          <div className="font-semibold">Objet : {tpl.subject}</div>
          <div className="mt-1 whitespace-pre-line text-muted-foreground">{tpl.message}</div>
        </div>
      )}
      {rows === undefined && <Skeleton className="h-24 rounded-3xl" />}
      {rows?.length === 0 && <p className="rounded-3xl bg-surface p-5 text-[0.95rem] text-muted-foreground">Aucun client à relancer pour l&apos;instant 👌</p>}
      {rows && rows.length > 0 && (
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={() => setPicked(picked.size === sendable.length ? new Set() : new Set(sendable.map((r) => r._id)))}
            className="font-semibold underline underline-offset-4"
          >
            {picked.size === sendable.length && sendable.length > 0 ? "Tout désélectionner" : `Tout sélectionner (${sendable.length})`}
          </button>
          <span className="text-muted-foreground">
            {picked.size} sélectionné{picked.size > 1 ? "s" : ""}
          </span>
        </div>
      )}
      <div className="space-y-2">
        {rows?.map((r) => (
          <label key={r._id} className={cn("flex cursor-pointer items-center gap-3 rounded-3xl border border-border p-4", r.waitingUntil && "cursor-not-allowed opacity-50")}>
            <input type="checkbox" disabled={Boolean(r.waitingUntil)} checked={picked.has(r._id)} onChange={() => toggle(r._id)} className="size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {r.customerName} <span className="font-normal text-muted-foreground">· {r.customerEmail}</span>
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {r.productTitle} · {STATUS_LABEL[r.status] ?? r.status} · {fmtDateTime(r.at)}
              </div>
              {r.reason && r.status === "failed" && <div className="truncate text-xs text-muted-foreground">{r.reason}</div>}
              {r.waitingUntil ? (
                <div className="text-xs text-muted-foreground">Relancé il y a moins d&apos;une heure</div>
              ) : r.emailsSent > 0 ? (
                <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="size-3" /> {r.emailsSent} email{r.emailsSent > 1 ? "s" : ""} déjà envoyé{r.emailsSent > 1 ? "s" : ""}
                </div>
              ) : null}
            </div>
          </label>
        ))}
      </div>
      {picked.size > 0 && (
        <div className="sticky bottom-24 z-20 mt-4 flex items-center gap-3 rounded-2xl bg-foreground p-2 pl-5 text-background shadow-2xl lg:bottom-6">
          {confirming ? (
            <>
              <span className="flex-1 text-sm font-medium">
                Envoyer {picked.size} email{picked.size > 1 ? "s" : ""} à de vrais clients ?
              </span>
              <button type="button" onClick={() => setConfirming(false)} className="h-11 rounded-xl px-3 text-sm font-semibold text-background/80">
                Annuler
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-brand-foreground disabled:opacity-60"
              >
                {sending && <Loader2 className="size-4 animate-spin" />} Confirmer l&apos;envoi
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm font-medium">
                {picked.size} client{picked.size > 1 ? "s" : ""} · modèle « {tpl?.label} »
              </span>
              {waStatus?.configured && (
                <button
                  type="button"
                  onClick={sendWa}
                  disabled={sending}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-background/15 px-4 font-semibold disabled:opacity-60"
                >
                  <WhatsAppIcon className="size-4" /> WhatsApp
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-brand-foreground"
              >
                <Mail className="size-4" /> Envoyer
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

const WA_STATUS: Record<string, string> = { queued: "En file", sending: "Envoi…", sent: "Envoyé", failed: "Échec", skipped: "Ignoré" };
const WA_KIND: Record<string, string> = { failed: "Paiement échoué", cart: "Rappel", link: "Lien (après réponse)", ack: "Confirmation STOP" };

/** État et file du worker WhatsApp automatique (numéro partagé, plafonds appliqués côté serveur). */
function WhatsappAuto() {
  const s = useStoreQuery(api.whatsapp.status, {});
  const setPaused = useMutation(api.whatsapp.setPaused);
  if (s === undefined || !s.configured) return null;
  const toggle = async () => {
    try {
      await setPaused({ paused: !s.paused });
      toast.success(s.paused ? "Envois WhatsApp repris" : "Envois WhatsApp mis en pause");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">WhatsApp automatique</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Le premier message ne contient pas de lien : il demande de répondre OUI, et le lien n&apos;est envoyé qu&apos;à ceux qui répondent. Envois au compte-gouttes, de 8 h à 20 h,
        STOP respecté.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          value={s.paused ? "En pause" : s.connected ? "Connecté" : "Déconnecté"}
          label="Numéro"
          hint={s.pauseReason ?? (s.phone ? `+${s.phone}` : "Le worker n'a pas répondu récemment.")}
        />
        <StatCard
          value={`${s.sent24}/${s.dailyCap}`}
          label="Envoyés (24 h)"
          hint={s.warmupDay ? `Jour ${s.warmupDay} d'échauffement : le plafond monte progressivement.` : "Le plafond démarre bas puis monte."}
        />
        <StatCard value={s.queued} label="En file (cette boutique)" hint={s.quietHours ? "Hors horaires d'envoi : reprise à 8 h (Bénin)." : "Envoi dans la fenêtre 8 h – 20 h."} />
      </div>
      {s.canControl && (
        <button type="button" onClick={toggle} className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold hover:bg-[#eceeec]">
          {s.paused ? "Reprendre les envois" : "Mettre en pause tous les envois"}
        </button>
      )}
      {s.recent.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {s.recent.map((r) => (
            <div key={r._id} className="flex items-center gap-3 rounded-2xl border border-border px-4 py-2.5 text-sm">
              <span className="font-semibold">{WA_KIND[r.kind] ?? r.kind}</span>
              <span className="text-muted-foreground">{r.to}</span>
              {r.replied && <span className="rounded-full bg-[var(--success-bg)] px-2 py-0.5 text-xs font-semibold text-[var(--success-fg)]">a répondu</span>}
              <span className="ml-auto text-muted-foreground">
                {WA_STATUS[r.status] ?? r.status} · {fmtDateTime(r.at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function WhatsappQueue() {
  const rows = useStoreQuery(api.recovery.whatsappQueue, {});
  const done = useStoreMutation(api.recovery.markWhatsappDone);
  const origin = useCurrentStore().store.url;
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">À relancer sur WhatsApp</h2>
      <p className="mb-3 text-sm text-muted-foreground">Un message personnel convertit souvent mieux qu&apos;un email. Le lien envoyé pré-remplit sa commande.</p>
      {rows === undefined && <Skeleton className="h-24 rounded-3xl" />}
      {rows?.length === 0 && <p className="rounded-3xl bg-surface p-5 text-[0.95rem] text-muted-foreground">Personne à relancer pour l&apos;instant 👌</p>}
      <div className="space-y-2.5">
        {rows?.map((r) => {
          const link = `${origin}/checkout/${r.productSlug ?? ""}?reprise=${r._id}&k=${r.accessKey}`;
          const text = `Bonjour ${r.customerName.split(" ")[0]}, j'ai vu que ta commande « ${r.productTitle} » n'est pas allée au bout. Un souci avec le paiement ? Tu peux la finaliser ici : ${link}`;
          return (
            <div key={r._id} className="flex flex-wrap items-center gap-3 rounded-3xl border border-border p-4">
              {/* Mobile : infos sur toute la largeur, boutons en dessous ; ordinateur : sur une ligne */}
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <div className="truncate font-semibold">{r.customerName}</div>
                <div className="truncate text-sm text-muted-foreground">
                  {r.productTitle} · <Money value={r.net} /> · {fmtDateTime(r.at)}
                </div>
                {r.emailsSent > 0 && (
                  <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="size-3" /> {r.emailsSent} email{r.emailsSent > 1 ? "s" : ""} de relance déjà envoyé{r.emailsSent > 1 ? "s" : ""}
                  </div>
                )}
              </div>
              <a
                href={waLink(r.customerPhone, text)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#dcfce7] px-4 text-sm font-semibold text-[#166534]"
              >
                <WhatsAppIcon className="size-4" /> Écrire
              </a>
              <button
                type="button"
                onClick={() => done({ saleId: r._id })}
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-semibold"
                title="Retirer de la liste"
              >
                <Check className="size-4" /> Relancé
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
