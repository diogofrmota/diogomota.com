import type { Metadata } from "next";
import { MessagePage } from "@/components/site/MessagePage";
import { siteViewport } from "@/lib/site";

// Placeholder until auth (roadmap Goal 5).
export const metadata: Metadata = { title: "sign up", robots: { index: false } };

export const viewport = siteViewport;

export default function SignUpPage() {
  return (
    <MessagePage
      title="sign up"
      message="Accounts are coming soon."
      link={{ href: "/apps", label: "Back to Apps" }}
    />
  );
}
