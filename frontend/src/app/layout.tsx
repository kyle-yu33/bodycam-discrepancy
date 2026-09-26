import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Fieldnote · Bodycam review", description: "Two-pass Gemini video event analysis" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
