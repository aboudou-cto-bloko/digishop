import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { createAccount, getAuthSessionId, getAuthUserId, invalidateSessions, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";
import { z } from "zod";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const PROVIDER = "password";

// ── Lectures internes (auth.ts, emails) ──────────────────────────────────

/** Compte admin portant cet email (connexion autorisée après un changement d'email). */
export const adminByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) =>
    await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first(),
});

export const userCount = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("users").take(2)).length,
});

/** Email du propriétaire de la boutique (destinataire par défaut des notifications vendeur). */
export const adminEmail = internalQuery({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const ownerId = (await ctx.db.get(storeId))?.ownerId;
    // Boutique sans propriétaire (avant rattachement) : ancien comportement, premier compte
    const owner = ownerId ? await ctx.db.get(ownerId) : await ctx.db.query("users").first();
    return owner?.email ?? null;
  },
});

export const userById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await ctx.db.get(userId),
});

// ── Mon compte ───────────────────────────────────────────────────────────

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return user ? { email: user.email ?? "" } : null;
  },
});

/**
 * Vérifie le mot de passe de l'admin CONNECTÉ (son email réel, jamais ADMIN_EMAIL qui ne sert qu'à l'installation).
 * Utilisé par « Mon compte » et par les opérations sensibles (retraits, numéros de retrait).
 */
export async function verifyCurrent(ctx: ActionCtx, current: string): Promise<{ userId: Id<"users">; email: string }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Non autorisé");
  const user = await ctx.runQuery(internal.account.userById, { userId });
  if (!user?.email) throw new ConvexError("Compte introuvable.");
  try {
    await retrieveAccount(ctx, { provider: PROVIDER, account: { id: user.email, secret: current } });
  } catch {
    throw new ConvexError("Mot de passe actuel incorrect.");
  }
  return { userId, email: user.email };
}

export const changePassword = action({
  args: { current: v.string(), next: v.string() },
  handler: async (ctx, { current, next }) => {
    if (next.length < 8) throw new ConvexError("Le nouveau mot de passe doit faire au moins 8 caractères.");
    if (next === current) throw new ConvexError("Le nouveau mot de passe doit être différent de l'actuel.");
    const { userId, email } = await verifyCurrent(ctx, current);
    await modifyAccountCredentials(ctx, { provider: PROVIDER, account: { id: email, secret: next } });
    // Les autres appareils connectés sont déconnectés ; la session en cours reste ouverte
    const sessionId = await getAuthSessionId(ctx);
    await invalidateSessions(ctx, { userId, except: sessionId ? [sessionId] : [] });
  },
});

const emailSchema = z.email("Adresse email invalide.").max(120);

export const changeEmail = action({
  args: { email: v.string(), current: v.string() },
  handler: async (ctx, { email, current }) => {
    const parsed = emailSchema.safeParse(email.trim().toLowerCase());
    if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "Adresse email invalide.");
    const next = parsed.data;
    const { userId, email: old } = await verifyCurrent(ctx, current);
    if (next === old) throw new ConvexError("C'est déjà ton adresse actuelle.");
    await ctx.runMutation(internal.account.applyEmail, { userId, old, next });
  },
});

/** Change l'identifiant de connexion (authAccounts) et l'email du compte ; le mot de passe reste valable. */
export const applyEmail = internalMutation({
  args: { userId: v.id("users"), old: v.string(), next: v.string() },
  handler: async (ctx, { userId, old, next }) => {
    const taken = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", PROVIDER).eq("providerAccountId", next))
      .first();
    if (taken) throw new ConvexError("Cette adresse est déjà utilisée.");
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", PROVIDER).eq("providerAccountId", old))
      .first();
    if (!account || account.userId !== userId) throw new ConvexError("Compte introuvable.");
    await ctx.db.patch(account._id, { providerAccountId: next });
    await ctx.db.patch(userId, { email: next });
  },
});

// ── Équipe : plusieurs administrateurs, ajoutés uniquement par invitation ───

/** Mot de passe temporaire lisible (sans caractères ambigus), à changer à la 1re connexion. */
function tempPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export const members = query({
  args: {},
  handler: async (ctx) => {
    const me = await getAuthUserId(ctx);
    if (!me) return null;
    const users = await ctx.db.query("users").take(50);
    return users.map((u) => ({ id: u._id, email: u.email ?? "", me: u._id === me, since: u._creationTime }));
  },
});

export const recordInvite = internalMutation({
  args: { email: v.string(), invitedBy: v.id("users") },
  handler: async (ctx, { email, invitedBy }) => {
    const exists = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) => q.eq("provider", PROVIDER).eq("providerAccountId", email))
      .first();
    if (exists) throw new ConvexError("Cette adresse a déjà un accès.");
    if ((await ctx.db.query("users").take(20)).length >= 10) throw new ConvexError("10 administrateurs maximum.");
    await ctx.db.insert("adminInvites", { email, invitedBy, createdAt: Date.now() });
  },
});

/** Crée le compte invité avec un mot de passe temporaire ; renvoyé une seule fois (et envoyé par email si possible). */
async function createInvited(ctx: ActionCtx, email: string, invitedBy: Id<"users">) {
  await ctx.runMutation(internal.account.recordInvite, { email, invitedBy });
  const secret = tempPassword();
  await createAccount(ctx, { provider: PROVIDER, account: { id: email, secret }, profile: { email } });
  return secret;
}

export const invite = action({
  args: { email: v.string(), current: v.string() },
  handler: async (ctx, { email, current }): Promise<{ tempPassword: string; emailed: boolean }> => {
    const parsed = emailSchema.safeParse(email.trim().toLowerCase());
    if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "Adresse email invalide.");
    const { userId, email: by } = await verifyCurrent(ctx, current);
    const secret = await createInvited(ctx, parsed.data, userId);
    const emailed = await ctx.runAction(internal.email.send.adminInvite, { to: parsed.data, tempPassword: secret, invitedBy: by });
    return { tempPassword: secret, emailed };
  },
});

/** Ligne de commande (clé de déploiement) : accès de secours quand plus personne ne peut se connecter. */
export const inviteFromCli = internalAction({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<string> => {
    const clean = emailSchema.parse(email.trim().toLowerCase());
    const first = await ctx.runQuery(internal.account.firstUserId, {});
    if (!first) throw new ConvexError("Aucun compte existant : utilise la première connexion.");
    const secret = await createInvited(ctx, clean, first);
    await ctx.runAction(internal.email.send.adminInvite, { to: clean, tempPassword: secret, invitedBy: "L'équipe Chairow" });
    return secret;
  },
});

export const firstUserId = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("users").first())?._id ?? null,
});

export const removeMember = action({
  args: { userId: v.id("users"), current: v.string() },
  handler: async (ctx, { userId, current }) => {
    const { userId: me } = await verifyCurrent(ctx, current);
    if (me === userId) throw new ConvexError("Tu ne peux pas retirer ton propre accès.");
    await invalidateSessions(ctx, { userId });
    await ctx.runMutation(internal.account.deleteMember, { userId });
  },
});

export const deleteMember = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    if ((await ctx.db.query("users").take(2)).length < 2) throw new ConvexError("Il doit rester au moins un administrateur.");
    // Multi-propriétaires : retirer un compte qui possède des boutiques les rendrait inaccessibles à tous
    const owned = await ctx.db.query("stores").withIndex("by_owner", (q) => q.eq("ownerId", userId)).first();
    if (owned) throw new ConvexError(`Ce compte possède la boutique « ${owned.name} » : transfère-la à un autre compte avant de le retirer.`);
    for (const a of await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect())
      await ctx.db.delete(a._id);
    for (const s of await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect())
      await ctx.db.delete(s._id);
    await ctx.db.delete(userId);
  },
});
