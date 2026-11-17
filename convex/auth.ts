import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ConvexError } from "convex/values";

// Plateforme mono-vendeur : un seul compte admin.
//  - Création : le 1er compte avec ADMIN_EMAIL + code d'installation (ADMIN_SETUP_CODE) ;
//    les suivants uniquement sur invitation d'un admin (Mon compte → Équipe).
//  - Connexion : seuls les comptes existants peuvent se connecter ; l'email se change depuis « Mon compte ».
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        if (params.flow === "signUp") {
          const admin = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
          if (!admin || email !== admin) throw new ConvexError("Cet email n'a pas accès au dashboard.");
          // Sans le code, n'importe qui connaissant l'email pourrait créer l'accès avant le vendeur
          const setup = process.env.ADMIN_SETUP_CODE?.trim();
          if (setup && String(params.setupCode ?? "").trim() !== setup) throw new ConvexError("Code d'installation incorrect.");
        }
        return { email };
      },
    }),
  ],
  callbacks: {
    // Garde-fou transactionnel : un nouvel utilisateur (hors tout premier) doit avoir une invitation non utilisée
    async afterUserCreatedOrUpdated(ctx, { existingUserId, profile }) {
      if (existingUserId) return;
      const users = await ctx.db.query("users").take(2);
      if (users.length <= 1) return;
      const email = String(profile.email ?? "").trim().toLowerCase();
      const invite = (
        await ctx.db
          .query("adminInvites")
          .filter((q) => q.eq(q.field("email"), email)) // contexte non typé ici ; table minuscule
          .collect()
      ).find((i) => !i.usedAt);
      if (!invite) throw new ConvexError("Le compte admin existe déjà : connecte-toi.");
      await ctx.db.patch(invite._id, { usedAt: Date.now() });
    },
  },
});
