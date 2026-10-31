import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "diogo mota",
  description: "diogo mota, devops engineer based in Lisbon.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
