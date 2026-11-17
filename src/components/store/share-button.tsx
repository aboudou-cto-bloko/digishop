"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { track } from "@/lib/track";

/** Partage natif (mobile) ou copie du lien. */
export function ShareButton({ title, productId, className }: { title: string; productId?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    track("share", { productId });
    const url = window.location.href.split("?")[0];
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* partage annulé */
      }
      return;
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button type="button" onClick={() => void share()} className={className}>
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />} {copied ? "Lien copié" : "Partager"}
    </button>
  );
}

/** Lien WhatsApp « Contact » mesuré (le clic sort de la boutique). */
export function ContactLink({ href, productId, className, children }: { href?: string; productId?: string; className?: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" onClick={() => href && track("contact", { productId })} className={className}>
      {children}
    </a>
  );
}
