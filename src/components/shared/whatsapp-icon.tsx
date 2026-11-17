import { siWhatsapp } from "simple-icons";
import { cn } from "@/lib/utils";

/** Logo officiel WhatsApp (tracé de marque fourni par simple-icons), vert WhatsApp par défaut. */
export function WhatsAppIcon({ className, color = `#${siWhatsapp.hex}` }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path fill={color} d={siWhatsapp.path} />
    </svg>
  );
}
