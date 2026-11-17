"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Store,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { LogoMark } from "@/components/shared/logo";
import { PwaRegister } from "@/components/admin/push-settings";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useHideAmounts } from "@/hooks/use-hide-amounts";
import { cn } from "@/lib/utils";
import { CommandMenu } from "./command-menu";
import { StoreSwitcher } from "./store-switcher";
import { FirstStore } from "./first-store";
import { CurrentStoreProvider, useCurrentStore } from "@/hooks/use-current-store";
import { NAV } from "./nav";
import { MobileTabBar } from "./mobile-tab-bar";
import { BRAND } from "../../../convex/lib/brand";


const TITLES: [string, string][] = [
  ["/admin/produits/", "Produit"],
  ["/admin/ventes", "Ventes"],
  ["/admin/produits", "Produits"],
  ["/admin/clients", "Clients"],
  ["/admin/revenus", "Revenus"],
  ["/admin/analytiques", "Analytiques"],
  ["/admin/reductions", "Réductions"],
  ["/admin/boutiques", "Mes boutiques"],
  ["/admin/pages", "Pages de contenu"],
  ["/admin/vitrine", "Vitrine"],
  ["/admin/automatisations", "Automatisations"],
  ["/admin/parametres", "Paramètres"],
  ["/admin/plus", "Plus"],
  ["/admin/compte", "Mon compte"],
  ["/admin", "Aperçu"],
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <PwaRegister />
      <CurrentStoreProvider fallback={<ShellFallback />} empty={<FirstStore />}>
        <Shell>{children}</Shell>
      </CurrentStoreProvider>
    </Suspense>
  );
}

function ShellFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <LogoMark className="size-10 animate-pulse" />
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { store } = useCurrentStore();
  const { hidden, toggle } = useHideAmounts();
  const { signOut } = useAuthActions();
  const [collapsed, setCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? "Aperçu";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shopUrl = store.url;
  const copyShop = async () => {
    try {
      await navigator.clipboard.writeText(shopUrl);
      toast.success("Lien de la boutique copié");
    } catch {
      toast.error("Copie impossible");
    }
  };

  const logout = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <TooltipProvider delay={200}>
      <div className="min-h-dvh bg-background">
        {/* ── Sidebar desktop ── */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 hidden flex-col px-3 pb-4 pt-4 lg:flex",
            collapsed ? "w-[84px]" : "w-[272px]",
          )}
        >
          <Link href="/admin" className="mb-5 flex h-9 items-center gap-2 px-2">
            <LogoMark />
            {!collapsed && <span className="text-[1.45rem] font-semibold tracking-tight">{BRAND.name}</span>}
          </Link>

          <StoreSwitcher collapsed={collapsed} className="mb-4" />

          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <SideLink key={href} href={href} label={label} active={isActive(pathname, href)} collapsed={collapsed}>
                <Icon />
              </SideLink>
            ))}
          </nav>

          <div className="flex flex-col gap-1">
            <SideLink href="/admin/parametres" label="Paramètres" active={pathname.startsWith("/admin/parametres") || pathname.startsWith("/admin/pages")} collapsed={collapsed}>
              <Settings />
            </SideLink>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl px-3 text-[1.02rem] text-foreground/85 transition hover:bg-[#e6e8e6] [&_svg]:size-[22px] [&_svg]:stroke-[1.5]",
                collapsed && "justify-center px-0",
              )}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              {!collapsed && "Réduire le menu"}
            </button>
            {!collapsed && <p className="mt-2 px-3 text-[0.7rem] leading-snug text-muted-foreground">{BRAND.disclaimer}</p>}
          </div>
        </aside>

        <div className={cn("lg:pl-[272px]", collapsed && "lg:pl-[84px]")}>
          {/* ── Top bar desktop ── */}
          <header className="sticky top-0 z-20 hidden h-[68px] items-center gap-3 bg-background px-4 lg:flex">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex size-10 items-center justify-center rounded-full hover:bg-[#e6e8e6]"
              aria-label="Retour"
            >
              <ArrowLeft className="size-5" />
            </button>
            <span className="min-w-28 text-[1.05rem] font-semibold">{title}</span>
            <button
              type="button"
              onClick={() => setCmdOpen(true)}
              className="flex h-11 max-w-xl flex-1 items-center gap-3 rounded-full bg-[#e9ebe9] px-4 text-left text-[0.95rem] text-muted-foreground hover:bg-[#e3e5e3]"
            >
              <Search className="size-[18px]" />
              <span className="truncate">
                Trouvez n&apos;importe quoi : appuyez sur{" "}
                <kbd className="rounded-md bg-[#d9dcd9] px-1.5 py-0.5 font-sans text-xs">⌘K</kbd> sur votre clavier
              </span>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex h-11 items-center overflow-hidden rounded-full bg-[#e9ebe9]">
                <a href={shopUrl} target="_blank" rel="noreferrer" className="flex h-full items-center gap-2 px-4 text-[0.95rem] font-medium hover:bg-[#e0e3e0]">
                  <Store className="size-[18px] stroke-[1.6]" /> Visiter ma boutique
                </a>
                <button type="button" onClick={copyShop} className="flex h-full items-center border-l border-[#d6d9d6] px-3 hover:bg-[#e0e3e0]" aria-label="Copier le lien de la boutique">
                  <Copy className="size-[18px] stroke-[1.6]" />
                </button>
              </div>
              <RoundButton label="Ajouter un produit" onClick={() => router.push("/admin/produits?nouveau=1")}>
                <Plus />
              </RoundButton>
              <RoundButton label={hidden ? "Afficher les montants" : "Masquer les montants"} onClick={toggle}>
                {hidden ? <EyeOff /> : <Eye />}
              </RoundButton>
              <AccountMenu onLogout={logout} />
            </div>
          </header>

          {/* ── Header mobile ── */}
          <header className="glass-bar pt-safe sticky top-0 z-20 flex min-h-[68px] items-center gap-2 px-4 lg:hidden">
            <Link href="/admin" className="flex items-center gap-2">
              <LogoMark />
              <span className="text-[1.4rem] font-semibold tracking-tight">{BRAND.name}</span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <RoundButton label={hidden ? "Afficher les montants" : "Masquer les montants"} onClick={toggle}>
                {hidden ? <EyeOff /> : <Eye />}
              </RoundButton>
              <RoundButton label="Rechercher" onClick={() => setCmdOpen(true)} className="bg-brand hover:bg-brand-hover">
                <Search />
              </RoundButton>
              <AccountMenu onLogout={logout} />
            </div>
          </header>

          <main className="px-0 pb-32 lg:px-4 lg:pb-6">
            <div className="min-h-[calc(100dvh-68px-1.5rem)] rounded-t-[28px] bg-card px-4 py-6 sm:px-6 lg:rounded-[28px] lg:px-8 lg:py-8">
              {children}
            </div>
          </main>
        </div>

        {/* ── Barre d'onglets mobile (Liquid Glass, fixée via un portail) ── */}
        <MobileTabBar pathname={pathname} />

        <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
      </div>
    </TooltipProvider>
  );
}

function SideLink({
  href,
  label,
  active,
  collapsed,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex h-11 items-center gap-3 rounded-xl px-3 text-[1.02rem] transition [&_svg]:size-[22px] [&_svg]:stroke-[1.5]",
        active ? "bg-[#e3e5e3] font-medium text-foreground [&_svg]:text-[#d9a400]" : "text-foreground/85 hover:bg-[#e9ebe9]",
        collapsed && "justify-center px-0",
      )}
    >
      {children}
      {!collapsed && label}
    </Link>
  );
}

function RoundButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-11 items-center justify-center rounded-full bg-[#e9ebe9] transition hover:bg-[#e0e3e0] [&_svg]:size-5 [&_svg]:stroke-[1.7]",
        className,
      )}
    >
      {children}
    </button>
  );
}

function AccountMenu({ onLogout }: { onLogout: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Mon compte"
        className="flex size-11 items-center justify-center rounded-full bg-[#e9ebe9] transition hover:bg-[#e0e3e0]"
      >
        <UserRound className="size-5 fill-foreground stroke-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem render={<Link href="/admin/compte" />}>
          <UserRound className="size-4" /> Mon compte
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/admin/parametres" />}>
          <Settings className="size-4" /> Paramètres
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onLogout}>
          <LogOut className="size-4" /> Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
