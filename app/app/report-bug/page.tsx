import type { Metadata } from "next";
import { getUser } from "@/auth";
import { AppFrame } from "@/components/common/AppShell";
import ui from "@/components/common/ui.module.css";
import { ContactForm } from "@/components/site/ContactForm";
import { SiteFrame } from "@/components/site/SiteFrame";
import { appViewport } from "@/lib/apps";
import { contactEmail } from "@/lib/site";
import { defaultTheme } from "@/lib/themes";
import { sendBugReport } from "./actions";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "report a bug",
  description: "Tell Diogo about something on diogomota.com that doesn't work.",
  robots: { index: false },
};

export const viewport = appViewport;

// Report a bug, linked from home's footer (logged in): a form that emails
// Diogo, as /about's Get in touch does (CONTACT_EMAIL, when set: the address
// itself is never on the page), with the account, the version and the browser
// over the message. Logged in, in the apps' frame and the user's theme, the
// name and email filled in; logged out, in the website's frame, as /privacy.
export default async function ReportBugPage() {
  const user = await getUser();
  const contact = contactEmail() !== null;
  const page = (
    <article className={`${styles.page} ${user ? "" : styles.inSite}`}>
      <h1 className={ui.heading}>Report a bug</h1>
      <p className={ui.muted}>
        Something not working as it should? Tell me what happened, and I&rsquo;ll look into it.
      </p>
      <section className={styles.card} aria-label="Bug report">
        {contact ? (
          <ContactForm
            action={sendBugReport}
            messageLabel="What went wrong?"
            messageHint="What you did, what you expected, and what happened instead. Which version of the site and which browser you're using are sent with it."
            submitLabel="Send report"
            defaults={user ? { name: user.name, email: user.email } : undefined}
          />
        ) : (
          <p>Bug reports can&rsquo;t be sent from here right now. Try again later.</p>
        )}
      </section>
    </article>
  );
  if (!user)
    return (
      <SiteFrame theme={defaultTheme} user={null}>
        {page}
      </SiteFrame>
    );
  return (
    <AppFrame theme={user.themePreference} username={user.username} name={user.name} avatarUrl={user.avatarUrl}>
      {page}
    </AppFrame>
  );
}
