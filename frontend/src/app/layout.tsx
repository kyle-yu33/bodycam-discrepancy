import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "EvidenceLens · Claim review", description: "Report claims linked to video evidence for human review" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
