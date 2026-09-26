import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// next/font loads the files itself, so we don't depend on webpack resolving the CSS-only packages.
const inter = localFont({
  src: [
    { path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const garamond = localFont({
  src: [
    { path: "../../node_modules/@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../../node_modules/@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-garamond",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EvidenceLens · Claim-evidence review",
  description: "Check each claim in a written report against body-worn camera footage, with the evidence linked.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${garamond.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
