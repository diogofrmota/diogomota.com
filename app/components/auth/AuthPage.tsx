import Link from "next/link";
import { SitePage } from "@/components/site/SitePage";
import site from "@/components/site/site.module.css";
import styles from "./AuthPage.module.css";

// Frame for /login, /signup and the password reset pages: a centered column with
// the form, a few lines of links under it, and a way back to /apps.
export function AuthPage({
  title,
  intro,
  form,
  children,
}: {
  title: string;
  /** A line between the title and the form. */
  intro?: React.ReactNode;
  form: React.ReactNode;
  /** Short lines under the form. */
  children: React.ReactNode;
}) {
  return (
    <SitePage centered>
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        {intro && <p className={`${site.muted} ${styles.intro}`}>{intro}</p>}
        {form}
        <div className={`${site.muted} ${styles.links}`}>{children}</div>
        <p className={styles.back}>
          <Link href="/apps" className={site.button}>
            Back to Apps
          </Link>
        </p>
      </main>
    </SitePage>
  );
}
