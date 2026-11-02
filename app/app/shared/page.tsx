import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { AppPlaceholder } from "@/components/common/AppPlaceholder";
import { findUserById } from "@/lib/users";

// Placeholder until the Shared app is built. proxy.ts keeps logged-out users out.
export const metadata: Metadata = { title: "Shared", robots: { index: false } };

export default async function SharedPage() {
  const { id, username } = await requireUser("/shared");
  const user = await findUserById(id);
  if (!user) notFound();

  return <AppPlaceholder name="Shared" username={username} theme={user.themePreference} />;
}
