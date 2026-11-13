import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/auth";
import { AuthPage } from "@/components/auth/AuthPage";
import ui from "@/components/common/ui.module.css";
import { appViewport } from "@/lib/apps";
import { memberName } from "@/lib/names";
import { authHref } from "@/lib/next-path";
import { readSpace, previewInvite } from "@/lib/spaces";
import { themeOf } from "@/lib/users";
import { JoinForm } from "./JoinForm";

// The code is in the URL: no Referer header carries it anywhere, and no search engine lists it.
export const metadata: Metadata = {
  title: "join a shared space",
  robots: { index: false },
  referrer: "no-referrer",
};

export const viewport = appViewport;

// An invite link (SH14, components/shared/InviteLink): who sent it, then Log in
// or Sign up (which come back here), or, logged in, Join. Opening it never joins
// by itself (a link preview or a prefetch would). Codes work once, for 24 hours.
export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const code = (await params).code.trim().toUpperCase();
  const valid = /^[A-HJ-NP-Z2-9]{8}$/.test(code);
  const [preview, session] = await Promise.all([valid ? previewInvite(code) : null, getSession()]);
  const theme = await themeOf(session?.user.id);
  const from = preview?.from ? memberName(preview.from) : null;

  if (!preview || preview.state !== "open") {
    return (
      <AuthPage
        title="This invite doesn't work"
        intro={
          preview?.state === "used"
            ? "Someone already joined with it: each invite works once. Ask for a new one."
            : preview?.state === "expired"
              ? "It expired: each invite works for 24 hours. Ask for a new one."
              : "There's no such invite. Ask for a new link."
        }
        theme={theme}
      />
    );
  }

  const title = from ? `${from} invited you to Shared` : "You're invited to Shared";
  const intro = "A calendar and task lists for the two of you: dinners, trips, the bins and the shopping.";
  if (!session) {
    const next = `/join/${code}`;
    return (
      <AuthPage title={title} intro={intro} theme={theme}>
        <p className={ui.actions}>
          {/* As everywhere: Log in plain and first, Sign up filled after it. */}
          <Link href={authHref("/login", next)} className={ui.button}>
            Log in
          </Link>
          <Link href={authHref("/signup", next)} className={`${ui.button} ${ui.primary}`}>
            Sign up
          </Link>
        </p>
        <p>Then you join, and Shared opens with the calendar.</p>
      </AuthPage>
    );
  }

  const current = await readSpace(session.user.id);
  if (current) {
    return (
      <AuthPage
        title={title}
        intro="You're already in a space, and you can be in one at a time. To join this one, leave yours first in Shared's Settings."
        action={{ href: "/shared/settings", label: "Open Settings" }}
        theme={theme}
      />
    );
  }
  return (
    <AuthPage
      title={title}
      intro={intro}
      form={<JoinForm code={code} label={from ? `Join ${from}'s space` : "Join the space"} />}
      theme={theme}
    />
  );
}
