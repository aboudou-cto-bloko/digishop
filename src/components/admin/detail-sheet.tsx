"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/** Panneau de détail : bottom sheet sur mobile (comme l'app Chariow), panneau latéral sur desktop. */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        showCloseButton={false}
        className={cn(
          "gap-0 border-0 bg-card p-0 text-base",
          desktop ? "w-full sm:max-w-[540px]" : "max-h-[94dvh] rounded-t-[28px]",
        )}
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        {!desktop && <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-[#d4d7d4]" aria-hidden />}
        <SheetClose
          aria-label="Fermer"
          className="absolute right-4 top-4 z-10 flex size-12 items-center justify-center rounded-full bg-[#e9ebe9] hover:bg-[#e0e3e0]"
        >
          <X className="size-6 stroke-[1.6]" />
        </SheetClose>
        <div className="overflow-y-auto px-5 pb-10 pt-6 sm:px-7">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
