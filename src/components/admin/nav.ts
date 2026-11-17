import { BadgePercent, ChartColumn, CircleDollarSign, House, Package, Palette, ShoppingBag, Users, Zap } from "lucide-react";

export const NAV = [
  { href: "/admin", label: "Accueil", icon: House },
  { href: "/admin/ventes", label: "Ventes", icon: ShoppingBag },
  { href: "/admin/produits", label: "Produits", icon: Package },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/revenus", label: "Revenus", icon: CircleDollarSign },
  { href: "/admin/analytiques", label: "Analytiques", icon: ChartColumn },
  { href: "/admin/reductions", label: "Réductions", icon: BadgePercent },
  { href: "/admin/vitrine", label: "Vitrine", icon: Palette },
  { href: "/admin/automatisations", label: "Automatisations", icon: Zap },
] as const;
