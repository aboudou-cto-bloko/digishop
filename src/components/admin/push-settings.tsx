"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BellRing, Download, Loader2, Smartphone, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/format";
import { BRAND } from "../../../convex/lib/brand";

type PushEvent = "sale" | "recovered" | "failed" | "payout";
const EVENTS: { id: PushEvent; label: string; help: string }[] = [
  { id: "sale", label: "Nouvelle vente", help: "Montant, produit et client." },
  { id: "recovered", label: "Vente récupérée par relance", help: "Un panier abandonné finalement payé." },
  { id: "failed", label: "Paiement échoué ou abandonné", help: "Pour relancer le client sur WhatsApp à chaud." },
  { id: "payout", label: "Retrait envoyé ou échoué", help: "Quand l'argent part vers ton numéro." },
];

// ── Installation (beforeinstallprompt doit être capté dès le chargement) ─────

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let installEvent: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribeInstall = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Enregistre le service worker du dashboard (portée /admin) et capte l'invite d'installation. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/admin" }).catch(() => undefined);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      installEvent = e as InstallEvent;
      emit();
    };
    const onInstalled = () => {
      installEvent = null;
      emit();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

function useInstall() {
  const canPrompt = useSyncExternalStore(subscribeInstall, () => Boolean(installEvent), () => false);
  const env = useSyncExternalStore(
    () => () => undefined,
    () => {
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      return `${ios ? 1 : 0}${standalone ? 1 : 0}`;
    },
    () => "00",
  );
  return { canPrompt, ios: env[0] === "1", standalone: env[1] === "1" };
}

// ── Abonnement push de cet appareil ───────────────────────────────────────

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceName() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Appareil";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navigateur";
  return `${br} · ${os}`;
}

function usePushDevice() {
  const supported = useSyncExternalStore(
    () => () => undefined,
    () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    () => false,
  );
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  useEffect(() => {
    if (!supported) return;
    let alive = true;
    void (async () => {
      const reg = await navigator.serviceWorker.getRegistration("/admin");
      const sub = await reg?.pushManager.getSubscription();
      if (!alive) return;
      setEndpoint(sub?.endpoint ?? null);
      setPermission(Notification.permission);
    })();
    return () => {
      alive = false;
    };
  }, [supported]);
  return { supported, endpoint, setEndpoint, permission, setPermission };
}

function isBrave() {
  return typeof navigator !== "undefined" && "brave" in navigator;
}

/** Message clair selon l'échec réel (les navigateurs renvoient des erreurs techniques peu lisibles). */
function explainPushError(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  const msg = e instanceof Error ? e.message : String(e);
  if (name === "NotAllowedError" || /permission/i.test(msg)) return "Notifications refusées pour ce site : autorise-les dans les réglages du navigateur (ou de l'app sur Android), puis réessaie.";
  if (name === "AbortError" || /push service/i.test(msg)) {
    return isBrave()
      ? "Brave bloque les notifications : Réglages → Confidentialité et sécurité → active « Utiliser les services Google pour la messagerie push », redémarre Brave, puis réessaie. Ou utilise Chrome."
      : "Le service de notifications du téléphone a refusé l'inscription : vérifie que les Services Google Play sont à jour et que l'économiseur de batterie ne bloque pas le navigateur, puis réessaie.";
  }
  if (name === "InvalidStateError") return "Un ancien abonnement bloque l'inscription : retire l'appareil dans la liste ci-dessous (ou efface les données du site), puis réessaie.";
  return errorMessage(e);
}

export function PushSettings() {
  const config = useQuery(api.push.config);
  const subs = useQuery(api.push.mySubscriptions);
  const subscribe = useMutation(api.push.subscribe);
  const unsubscribe = useMutation(api.push.unsubscribe);
  const setEvents = useMutation(api.push.setEvents);
  const sendTest = useAction(api.pushNode.sendTest);
  const { supported, endpoint, setEndpoint, permission, setPermission } = usePushDevice();
  const install = useInstall();
  const [busy, setBusy] = useState<string | null>(null);

  const mine = subs?.find((s) => s.endpoint === endpoint);

  const [lastError, setLastError] = useState<string | null>(null);

  const enable = async () => {
    if (!config?.publicKey) return toast.error("Clés VAPID manquantes sur le serveur.");
    setBusy("enable");
    setLastError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") throw new Error("Notifications refusées : autorise-les dans les réglages du navigateur pour ce site.");
      const reg = (await navigator.serviceWorker.getRegistration("/admin")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/admin" }));
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Le service de l'application ne démarre pas : recharge la page puis réessaie.")), 20000)),
      ]);
      // Certains navigateurs (Brave sans « services Google pour la messagerie push ») ne répondent jamais
      // Abonnement existant créé avec une autre clé (changement de serveur) : on le remplace
      const key = keyBytes(config.publicKey);
      const existing = await reg.pushManager.getSubscription();
      const existingKey = existing?.options.applicationServerKey ? new Uint8Array(existing.options.applicationServerKey) : null;
      const sameKey = existingKey !== null && existingKey.length === key.length && existingKey.every((b, i) => b === key[i]);
      if (existing && !sameKey) await existing.unsubscribe();
      const sub =
        (sameKey ? existing : null) ??
        (await Promise.race([
          reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Le service de notifications du navigateur ne répond pas. Sur Brave : Réglages → Confidentialité → activer « Utiliser les services Google pour la messagerie push ». Sinon, utilise Chrome.")), 15000),
          ),
        ]));
      const json = sub.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error("Abonnement incomplet, réessaie.");
      await subscribe({ endpoint: sub.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device: deviceName() });
      setEndpoint(sub.endpoint);
      toast.success("Notifications activées sur cet appareil");
    } catch (e) {
      const msg = explainPushError(e);
      setLastError(msg);
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: Id<"pushSubscriptions">, ep: string) => {
    setBusy(id);
    try {
      if (ep === endpoint) {
        const reg = await navigator.serviceWorker.getRegistration("/admin");
        await (await reg?.pushManager.getSubscription())?.unsubscribe();
        setEndpoint(null);
      }
      await unsubscribe({ id });
    } finally {
      setBusy(null);
    }
  };

  const test = async (id?: Id<"pushSubscriptions">) => {
    setBusy(`test-${id ?? "all"}`);
    try {
      const r = await sendTest({ id });
      toast.success(r.sent ? `Notification envoyée (${r.sent})` : "Aucun appareil n'a répondu");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Installation */}
      {!install.standalone && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-surface p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card">
            <Smartphone className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Installer l&apos;application</p>
            <p className="text-sm text-muted-foreground">
              {install.ios
                ? `Sur iPhone : touche Partager puis « Sur l'écran d'accueil », et ouvre ${BRAND.name} depuis l'icône pour activer les notifications.`
                : "Le dashboard s'ouvre comme une app, depuis ton écran d'accueil."}
            </p>
          </div>
          {install.canPrompt && (
            <button
              type="button"
              onClick={async () => {
                await installEvent?.prompt();
                installEvent = null;
                emit();
              }}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-4 font-semibold text-background"
            >
              <Download className="size-4" /> Installer
            </button>
          )}
        </div>
      )}

      {/* Cet appareil */}
      <div className="rounded-2xl border border-border p-4">
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            {install.ios && !install.standalone ? "Installe d'abord l'application (ci-dessus) : sur iPhone, les notifications ne marchent que depuis l'icône." : "Ce navigateur ne gère pas les notifications push."}
          </p>
        ) : mine ? (
          <div className="flex flex-wrap items-center gap-3">
            <BellRing className="size-5 text-[var(--success-fg)]" />
            <p className="min-w-0 flex-1 font-semibold">Notifications actives sur cet appareil</p>
            <button type="button" onClick={() => void test(mine._id)} disabled={busy !== null} className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold hover:bg-[#eceeec]">
              {busy === `test-${mine._id}` && <Loader2 className="size-4 animate-spin" />} Envoyer un test
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Recevoir les notifications ici</p>
              <p className="text-sm text-muted-foreground">
                {permission === "denied"
                  ? "Bloquées : sur Android, appui long sur l'icône de l'app (ou cadenas de la barre d'adresse) → Notifications → Autoriser, puis réessaie."
                  : "Une alerte à chaque vente, même app fermée."}
              </p>
              {isBrave() && !lastError && (
                <p className="mt-2 rounded-xl bg-[#fff7d6] px-3 py-2 text-sm">
                  Brave : active d&apos;abord <b>Réglages → Confidentialité et sécurité → « Utiliser les services Google pour la messagerie push »</b>, puis redémarre Brave.
                </p>
              )}
              {lastError && (
                <p role="alert" className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {lastError}
                </p>
              )}
            </div>
            <button type="button" onClick={() => void enable()} disabled={busy !== null || config === undefined} className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-5 font-bold text-brand-foreground hover:bg-brand-hover disabled:opacity-60">
              {busy === "enable" ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />} Activer
            </button>
          </div>
        )}
      </div>

      {/* Appareils abonnés */}
      {subs && subs.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-muted-foreground">Appareils abonnés ({subs.length})</p>
          {subs.map((s) => (
            <div key={s._id} className="rounded-2xl bg-surface p-4">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {s.device}
                    {s.endpoint === endpoint && <span className="ml-2 rounded-full bg-card px-2 py-0.5 text-xs">cet appareil</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ajouté le {new Date(s.createdAt).toLocaleDateString("fr-FR")}
                    {s.lastSuccessAt ? ` · dernière notification le ${new Date(s.lastSuccessAt).toLocaleDateString("fr-FR")}` : ""}
                  </p>
                </div>
                <button type="button" onClick={() => void remove(s._id, s.endpoint)} disabled={busy !== null} aria-label={`Retirer ${s.device}`} className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-destructive">
                  {busy === s._id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-5" />}
                </button>
              </div>
              <ul className="mt-3 space-y-1">
                {EVENTS.map((ev) => (
                  <li key={ev.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{ev.label}</span>
                        <span className="block text-xs text-muted-foreground">{ev.help}</span>
                      </span>
                      <Switch
                        checked={s.events.includes(ev.id)}
                        onCheckedChange={(on) => void setEvents({ id: s._id, events: on ? [...s.events, ev.id] : s.events.filter((x) => x !== ev.id) })}
                        aria-label={`${ev.label} sur ${s.device}`}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rappel sur l'accueil tant qu'aucun appareil ne reçoit les notifications. */
export function PushReminder() {
  const subs = useQuery(api.push.mySubscriptions);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture après hydratation
      setHidden(localStorage.getItem("push-reminder-hidden") === "1");
    } catch {
      /* stockage indisponible */
    }
  }, []);
  if (!subs || subs.length > 0 || hidden) return null;
  return (
    <div className="flex items-center gap-3 rounded-3xl bg-[#fff7d6] p-4">
      <BellRing className="size-5 shrink-0" />
      <p className="min-w-0 flex-1 text-sm">
        <b>Sois prévenu à chaque vente.</b> Active les notifications sur ton téléphone.
      </p>
      <Link href="/admin/parametres#notifications" className="inline-flex h-11 shrink-0 items-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background">
        Activer
      </Link>
      <button
        type="button"
        aria-label="Masquer"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem("push-reminder-hidden", "1");
          } catch {
            /* stockage indisponible */
          }
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-black/5"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
