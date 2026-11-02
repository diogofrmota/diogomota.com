import Link from "next/link";
import { Brackets, SitePage } from "./SitePage";
import site from "./site.module.css";
import styles from "./MessagePage.module.css";

// A centered heading, one line of text and one link: the 404 page and the
// placeholder routes.
export function MessagePage({
  title,
  message,
  link,
}: {
  title: string;
  message: string;
  link: { href: string; label: string };
}) {
  return (
    <SitePage centered>
      <main className={styles.main}>
        <h1 className={styles.title}>{title}</h1>
        <p className={site.muted}>{message}</p>
        <p className={styles.action}>
          <Link href={link.href} className={site.bracket}>
            <Brackets>{link.label}</Brackets>
          </Link>
        </p>
      </main>
    </SitePage>
  );
}
