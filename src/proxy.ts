import { NextResponse } from "next/server";
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isAdmin = createRouteMatcher(["/admin(.*)", "/apercu(.*)"]);
const isLogin = createRouteMatcher(["/login"]);
const isAppOnly = createRouteMatcher(["/admin(.*)", "/apercu(.*)", "/login", "/api/auth(.*)"]);

const ROOT = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000").toLowerCase();

/** Le paiement s'ouvre en widget sur la fiche produit : /checkout/<produit>?… → /p/<produit>?…&acheter=1 (paramètres conservés). */
function checkoutRedirect(request: Request, base: string, path: string) {
  const c = /^\/checkout\/([^/]+)\/?$/.exec(path);
  if (!c) return null;
  const url = new URL(request.url);
  url.pathname = `${base}/p/${c[1]}`;
  url.searchParams.set("acheter", "1");
  return NextResponse.redirect(url, 307);
}

/**
 * Multi-boutiques :
 *  - domaine racine (ROOT) → dashboard (la racine « / » mène à /admin)
 *  - slug.ROOT ou domaine personnalisé → vitrine de la boutique (résolue côté serveur par l'en-tête x-store-host)
 */
export const proxy = convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").toLowerCase();
    const { pathname, search } = request.nextUrl;

    // Une seule adresse officielle : www et les anciennes adresses *.vercel.app redirigent vers le domaine racine
    if (host === `www.${ROOT}` || (host.endsWith(".vercel.app") && !ROOT.endsWith(".vercel.app"))) {
      return NextResponse.redirect(`https://${ROOT}${pathname}${search}`, 308);
    }
    const isAppHost = host === ROOT;

    if (!isAppHost) {
      // Le dashboard n'est jamais servi sur le domaine d'une boutique
      if (isAppOnly(request)) {
        const proto = request.nextUrl.protocol;
        return NextResponse.redirect(`${proto}//${ROOT}${pathname}${search}`);
      }
      const toWidget = checkoutRedirect(request, "", pathname);
      if (toWidget) return toWidget;
      const headers = new Headers(request.headers);
      headers.set("x-store-host", host);
      return NextResponse.next({ request: { headers } });
    }

    // Mode chemin (ex. vercel.app sans domaine propre) : /b/<slug>/… → pages de la boutique
    const m = /^\/b\/([a-z0-9-]+)(\/.*)?$/.exec(pathname);
    if (m) {
      const toWidget = checkoutRedirect(request, `/b/${m[1]}`, m[2] || "/");
      if (toWidget) return toWidget;
      const headers = new Headers(request.headers);
      headers.set("x-store-slug", m[1]);
      headers.set("x-store-base", `/b/${m[1]}`);
      const url = request.nextUrl.clone();
      url.pathname = m[2] || "/";
      return NextResponse.rewrite(url, { request: { headers } });
    }

    if (pathname === "/") return nextjsMiddlewareRedirect(request, "/admin");
    const authed = await convexAuth.isAuthenticated();
    if (isAdmin(request) && !authed) return nextjsMiddlewareRedirect(request, "/login");
    if (isLogin(request) && authed) return nextjsMiddlewareRedirect(request, "/admin");
  },
  { cookieConfig: { maxAge: 60 * 60 * 24 * 30 } },
);

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)", "/b/:path*"],
};
