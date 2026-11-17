import { PreviewShell } from "./store-preview";

export const metadata = { robots: { index: false, follow: false } };

export default function PreviewLayout({ children, params }: { children: React.ReactNode; params: Promise<{ store: string }> }) {
  return <PreviewShell params={params}>{children}</PreviewShell>;
}
