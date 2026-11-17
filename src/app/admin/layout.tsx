import type { Metadata, Viewport } from "next";
import { AdminShell } from "@/components/admin/shell";
import { BRAND } from "../../../convex/lib/brand";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false },
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#141414" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
