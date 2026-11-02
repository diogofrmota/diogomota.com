import type { Metadata } from "next";
import { baseOpenGraph, siteDescription, siteName, siteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: siteName, template: `%s · ${siteName}` },
  description: siteDescription,
  openGraph: { ...baseOpenGraph, title: siteName, description: siteDescription },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
