import { SessionTransition } from "@/components/account/SessionTransition";
import { safeNextPath } from "@/lib/next-path";
import { sessionTransitionMode } from "@/lib/session-transition";
import { notFound } from "next/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const mode = await sessionTransitionMode(params.key);
  if (!mode) notFound();
  return <SessionTransition destination={safeNextPath(params.next) ?? "/"} preservePending={mode === "views"} />;
}
