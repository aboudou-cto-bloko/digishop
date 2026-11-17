"use client";

import { useAction, useQuery } from "convex/react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Loader2, Mail, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Mon compte : changer l'email de connexion et le mot de passe (le mot de passe actuel est toujours demandé). */
export default function AccountPage() {
  const me = useQuery(api.account.me);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-heading text-4xl">Mon compte</h1>
      <p className="mt-2 text-muted-foreground">
        Connecté avec <b className="text-foreground">{me?.email ?? "…"}</b>
      </p>
      <div className="mt-8 space-y-6">
        <PasswordForm />
        <EmailForm current={me?.email} />
        <TeamSection />
      </div>
    </div>
  );
}

function Card({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-card [&_svg]:size-5">{icon}</span>
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

const inputCls = "h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus:ring-2 focus:ring-foreground/10";

function PasswordInput({ id, label, autoComplete, value, onChange, hint }: { id: string; label: string; autoComplete: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      <div className="relative">
        <input id={id} type={show ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, "pr-12")} required />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground"
        >
          {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Submit({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground font-semibold text-background disabled:opacity-60 sm:w-auto sm:px-6">
      {pending && <Loader2 className="size-4 animate-spin" />} {children}
    </button>
  );
}

function PasswordForm() {
  const change = useAction(api.account.changePassword);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError("Le nouveau mot de passe doit faire au moins 8 caractères.");
    if (next !== confirm) return setError("La confirmation ne correspond pas au nouveau mot de passe.");
    setPending(true);
    try {
      await change({ current, next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Mot de passe modifié. Tes autres appareils ont été déconnectés.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card icon={<KeyRound />} title="Mot de passe" desc="Tes autres appareils seront déconnectés après le changement.">
      <form onSubmit={submit} className="space-y-4">
        <PasswordInput id="pw-current" label="Mot de passe actuel" autoComplete="current-password" value={current} onChange={setCurrent} />
        <PasswordInput id="pw-next" label="Nouveau mot de passe" autoComplete="new-password" value={next} onChange={setNext} hint="8 caractères minimum." />
        <PasswordInput id="pw-confirm" label="Confirme le nouveau mot de passe" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}
        <Submit pending={pending}>Changer le mot de passe</Submit>
      </form>
    </Card>
  );
}

function EmailForm({ current }: { current?: string }) {
  const change = useAction(api.account.changeEmail);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await change({ email, current: password });
      setEmail("");
      setPassword("");
      toast.success("Email modifié : utilise-le pour ta prochaine connexion.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card icon={<Mail />} title="Email de connexion" desc="C'est aussi l'adresse qui reçoit les notifications de vente, sauf si tu en as choisi une autre dans Paramètres.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="new-email" className="block font-semibold">
            Nouvel email
          </label>
          <input id="new-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={current} className={inputCls} required />
        </div>
        <PasswordInput id="email-pw" label="Mot de passe actuel (pour confirmer)" autoComplete="current-password" value={password} onChange={setPassword} />
        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}
        <Submit pending={pending}>Changer l&apos;email</Submit>
      </form>
    </Card>
  );
}

/** Équipe : administrateurs (accès complet), ajoutés uniquement par invitation. */
function TeamSection() {
  const members = useQuery(api.account.members);
  const invite = useAction(api.account.invite);
  const remove = useAction(api.account.removeMember);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const r = await invite({ email, current: password });
      setCreated({ email: email.trim().toLowerCase(), ...r });
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const onRemove = async (id: Id<"users">, who: string) => {
    if (!password) return setError(`Saisis ton mot de passe actuel ci-dessous pour retirer ${who}.`);
    if (!window.confirm(`Retirer l'accès de ${who} ? Il sera déconnecté immédiatement.`)) return;
    setRemoving(id);
    setError(null);
    try {
      await remove({ userId: id, current: password });
      toast.success(`Accès de ${who} retiré.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Card icon={<Users />} title="Équipe" desc="Chaque administrateur a son propre accès complet (ventes, produits, retraits). Ajoute-les ici plutôt que de partager ton mot de passe.">
      <ul className="divide-y divide-border rounded-2xl bg-card">
        {(members ?? []).map((m) => (
          <li key={m.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
            <span className="min-w-0 flex-1 truncate font-medium">
              {m.email}
              {m.me && <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-xs text-muted-foreground">toi</span>}
            </span>
            {!m.me && (
              <button type="button" onClick={() => void onRemove(m.id, m.email)} disabled={removing !== null} aria-label={`Retirer ${m.email}`} className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-destructive">
                {removing === m.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-5" />}
              </button>
            )}
          </li>
        ))}
      </ul>

      {created && (
        <div role="status" className="mt-4 rounded-2xl border-2 border-dashed border-[var(--success-fg)]/40 bg-[var(--success-bg)] p-4 text-sm">
          <p className="font-semibold text-[var(--success-fg)]">Accès créé pour {created.email}</p>
          <p className="mt-1 text-foreground/80">{created.emailed ? "Ses identifiants lui ont été envoyés par email." : "L'email n'a pas pu partir : transmets-lui ce mot de passe temporaire toi-même."} Il devra le changer à sa première connexion. Il ne sera plus affiché après cette page.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded-xl bg-card px-3 py-2.5 font-mono text-base tracking-wider">{created.tempPassword}</code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(created.tempPassword);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              aria-label="Copier le mot de passe temporaire"
              className="flex size-11 items-center justify-center rounded-xl bg-card"
            >
              {copied ? <Check className="size-5" /> : <Copy className="size-5" />}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="invite-email" className="block font-semibold">
            Ajouter un administrateur
          </label>
          <input id="invite-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemple.com" className={inputCls} required />
        </div>
        <PasswordInput id="team-pw" label="Ton mot de passe actuel (pour confirmer)" autoComplete="current-password" value={password} onChange={setPassword} />
        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}
        <Submit pending={pending}>Créer son accès</Submit>
      </form>
    </Card>
  );
}
