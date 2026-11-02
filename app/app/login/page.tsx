import type { Metadata } from "next";
import { MessagePage } from "@/components/site/MessagePage";
import { siteViewport } from "@/lib/site";

// Placeholder until auth (roadmap Goal 5).
export const metadata: Metadata = { title: "login", robots: { index: false } };

export const viewport = siteViewport;

export default function LoginPage() {
  return (
    <MessagePage
      title="login"
      message="Accounts are coming soon."
      link={{ href: "/apps", label: "Back to Apps" }}
    />
  );
}
