"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shared/logo";
import { BRAND } from "../../../convex/lib/brand";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    form.set("flow", flow);
    try {
      await signIn("password", form);
      router.replace("/admin");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("pas accès")) setError("Cet email n'a pas accès au dashboard.");
      else if (msg.includes("Code d'installation")) setError("Code d'installation incorrect (variable ADMIN_SETUP_CODE de ton projet Convex).");
      else if (msg.includes("existe déjà")) setError("Le compte admin existe déjà : connecte-toi avec ton email actuel.");
      else if (flow === "signIn") setError("Email ou mot de passe incorrect. Première connexion ? Crée ton mot de passe.");
      else if (/invalid password|at least 8|8 caract/i.test(msg)) setError("Le mot de passe doit faire au moins 8 caractères.");
      else setError("Impossible de créer l'accès : vérifie l'email et le code d'installation. Si ton accès existe déjà, connecte-toi.");
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo name={BRAND.name} />
        </div>
        <div className="rounded-3xl bg-card p-6 sm:p-8">
          <h1 className="font-heading text-3xl">{flow === "signIn" ? "Bon retour !" : "Première connexion"}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {flow === "signIn" ? "Connecte-toi pour suivre tes ventes." : "Choisis le mot de passe de ton dashboard."}
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required className="h-12 rounded-xl bg-surface text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={flow === "signIn" ? "current-password" : "new-password"}
                  minLength={8}
                  required
                  className="h-12 rounded-xl bg-surface pr-12 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </div>
            {flow === "signUp" && (
              <div className="space-y-2">
                <Label htmlFor="setupCode">Code d&apos;installation</Label>
                <Input id="setupCode" name="setupCode" autoComplete="off" required className="h-12 rounded-xl bg-surface text-base" />
                <p className="text-xs text-muted-foreground">Fourni à l&apos;installation, il protège la création de ton accès.</p>
              </div>
            )}
            {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-brand-foreground transition hover:bg-brand-hover disabled:opacity-60"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {flow === "signIn" ? "Se connecter" : "Créer mon accès"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => {
              setFlow(flow === "signIn" ? "signUp" : "signIn");
              setError(null);
            }}
            className={cn("mt-4 min-h-11 w-full text-sm text-muted-foreground underline-offset-4 hover:underline")}
          >
            {flow === "signIn" ? "Première connexion ? Crée ton mot de passe" : "J'ai déjà un mot de passe"}
          </button>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {BRAND.tagline}. {BRAND.disclaimer}
        </p>
      </div>
    </main>
  );
}
