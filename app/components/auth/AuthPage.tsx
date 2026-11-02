import Link from "next/link";
import { Brackets, SitePage } from "@/components/site/SitePage";
import site from "@/components/site/site.module.css";
import styles from "./AuthPage.module.css";

// Frame for /login and /signup: a centered column with the form, a few lines
// of links under it, and a way back to /apps.
export function AuthPage({
  title,
  form,
  children,
}: {
  title: string;
  form: React.ReactNode;
  /** Short lines under the form. */
  children: React.ReactNode;
}) {
  return (
    <SitePage centered>
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        {form}
        <div className={`${site.muted} ${styles.links}`}>{children}</div>
        <p className={styles.back}>
          <Link href="/apps" className={site.bracket}>
            <Brackets>Back to Apps</Brackets>
          </Link>
        </p>
      </main>
    </SitePage>
  );
}
