import Link from "next/link";
import { SitePage } from "./SitePage";
import site from "./site.module.css";
import styles from "./MessagePage.module.css";

// A centered heading, one line of text and a link, with Retry before it when
// given: the 404 page, an expired reset link and the error page.
export function MessagePage({
  title,
  message,
  link,
  onRetry,
}: {
  title: string;
  message: string;
  link: { href: string; label: string };
  onRetry?: () => void;
}) {
  return (
    <SitePage centered>
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        <p className={site.muted}>{message}</p>
        <p className={styles.action}>
          {onRetry && (
            <button type="button" className={site.button} onClick={onRetry}>
              Retry
            </button>
          )}
          <Link href={link.href} className={site.button}>
            {link.label}
          </Link>
        </p>
      </main>
    </SitePage>
  );
}
