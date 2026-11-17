"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckoutForm } from "@/app/(store)/checkout/[slug]/checkout-form";
import { storePath, track } from "@/lib/track";

const OPEN_EVENT = "ds:checkout-open";
const PARAM = "acheter";

/** Ouvre le widget de paiement de la fiche produit (si présent sur la page). */
export function openCheckout() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Bouton d'achat : ouvre le paiement par-dessus la fiche, sans changer de page.
 * Le lien reste un vrai lien (/checkout/…) : sans JavaScript ou en nouvel onglet, la redirection rouvre le widget.
 */
export function BuyButton({
  href,
  preview,
  className,
  children,
  onBeforeOpen,
}: {
  href: string;
  preview?: boolean;
  className?: string;
  children: ReactNode;
  onBeforeOpen?: () => void;
}) {
  if (preview) return <span className={className} title="Désactivé dans l'aperçu">{children}</span>;
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // nouvel onglet : comportement normal
    e.preventDefault();
    onBeforeOpen?.();
    openCheckout();
  };
  return (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
}

type FormProps = Omit<ComponentProps<typeof CheckoutForm>, "onClose">;

/** Paiement en panneau : feuille qui monte du bas sur mobile, panneau latéral qui sort de la droite sur ordinateur. */
export function CheckoutSheet(props: FormProps) {
  const [open, setOpen] = useState(false);
  const pushed = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const slug = props.product.slug;

  const show = useCallback(
    (fromUrl = false) => {
      if (!fromUrl) {
        const url = new URL(window.location.href);
        url.searchParams.set(PARAM, "1");
        window.history.pushState({ dsCheckout: true }, "", url);
        pushed.current = true;
      }
      setOpen(true);
      // Même chemin qu'avant (page /checkout) : le temps réel et les parcours restent lisibles
      track("page_view", { path: `/checkout/${slug}`, productId: props.product._id });
    },
    [slug, props.product._id],
  );

  const hide = useCallback(() => {
    setOpen(false);
    track("page_view", { path: storePath(), productId: props.product._id });
  }, [props.product._id]);

  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back(); // le popstate referme le widget
      return;
    }
    // Ouvert depuis un lien direct (?acheter=1, relance) : on nettoie l'URL sans quitter la page
    const url = new URL(window.location.href);
    for (const k of [PARAM, "reprise", "k", "promo", "code"]) url.searchParams.delete(k);
    window.history.replaceState(null, "", url);
    hide();
  }, [hide]);

  useEffect(() => {
    const onOpen = () => show();
    const onPop = () => {
      if (!new URL(window.location.href).searchParams.has(PARAM)) {
        pushed.current = false;
        hide();
      }
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("popstate", onPop);
    // Lien direct ou redirection depuis /checkout/… : ouverture immédiate (lecture de l'URL après hydratation)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (new URL(window.location.href).searchParams.has(PARAM)) show(true);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("popstate", onPop);
    };
  }, [show, hide]);

  // Échap pour fermer, page derrière figée, focus dans le widget
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, close]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-black/55 animate-in fade-in-0" onClick={close} aria-hidden />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Paiement : ${props.product.title}`}
        className="relative max-h-[94dvh] w-full overflow-y-auto overscroll-contain rounded-t-[28px] bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none animate-in slide-in-from-bottom-8 duration-300 ease-out sm:h-dvh sm:max-h-none sm:w-[480px] sm:max-w-[92vw] sm:rounded-none sm:rounded-l-[28px] sm:slide-in-from-bottom-0 sm:slide-in-from-right"
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-foreground/15 sm:hidden" aria-hidden />
        <CheckoutForm {...props} onClose={close} />
      </div>
    </div>,
    document.body,
  );
}
