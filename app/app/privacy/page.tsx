import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/auth";
import { AppFrame } from "@/components/common/AppShell";
import ui from "@/components/common/ui.module.css";
import { appViewport } from "@/lib/apps";
import { themeOf } from "@/lib/users";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "privacy",
  description: "What diogomota.com keeps about you, why, and how to take it with you or delete it.",
  alternates: { canonical: "/privacy" },
};

export const viewport = appViewport;

// What the apps keep about their users (AC1), in plain words: linked from
// sign-up, /apps and /account. In the user's theme when logged in.
export default async function PrivacyPage() {
  const session = await getSession();
  const theme = await themeOf(session?.user.id);
  return (
    <AppFrame theme={theme} username={session?.user.username ?? null}>
      <article className={styles.page}>
        <h1 className={ui.heading}>Privacy</h1>
        <p className={ui.muted}>
          diogomota.com is a personal site with small apps for friends, run by Diogo Mota in Lisbon. This is what it
          keeps about you, and what you can do about it.
        </p>

        <h2>What it keeps</h2>
        <ul>
          <li>
            <strong>Your account:</strong> your name, username, email and password (only a hash of it, never the
            password itself), your theme, and your profile picture if you add one (made small, without its location or
            other metadata).
          </li>
          <li>
            <strong>Shared:</strong> your space&rsquo;s members, calendar events and task lists, which everyone in the
            space sees and changes.
          </li>
          <li>
            <strong>Shows:</strong> your library (what you watch, plan and finished, and your progress), your friends,
            and what you recommend to them. Only friends you accepted see your library.
          </li>
          <li>
            <strong>Activity:</strong> what you did lately (an event added, a show finished), shown to your space or
            your friends for 60 days.
          </li>
          <li>
            <strong>Sessions:</strong> a cookie that keeps you logged in, and which devices are logged in (their IP
            address and browser), so logging out or changing your password can end them. No tracking or advertising
            cookies, and no analytics.
          </li>
        </ul>

        <h2>Who else sees it</h2>
        <p>
          Nobody sells or shares it. The site runs on a server in Europe (OVH), emails are sent by Resend (EU), and the
          Shows app gets titles and posters from TMDB, which then sees your browser loading the posters. Backups of the
          database are kept for two weeks.
        </p>

        <h2>Your data, your choice</h2>
        <p>
          In <Link href="/account">Account</Link>, Your data has <strong>Download my data</strong> (everything above, as
          a file) and <strong>Delete my account</strong>, which deletes it all at once: you leave your space (the space
          goes with its last member) and your library, friends and activity go. Backups forget it within two weeks.
        </p>
        <p>Questions, or anything you want changed: ask Diogo.</p>
        <p className={ui.note}>Last changed on 13 November 2026.</p>
      </article>
    </AppFrame>
  );
}
