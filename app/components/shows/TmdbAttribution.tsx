import Image from "next/image";
import styles from "./Shows.module.css";

// TMDB's logo, less prominent than the app's own name, wherever its data or
// images are shown, linking to TMDB (https://www.themoviedb.org/api-terms-of-use,
// section 3). The logo file is TMDB's own, unchanged.
export function TmdbAttribution() {
  return <footer className={styles.attribution}>
    <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className={styles.tmdbLink}>
      <Image src="/logos/tmdb.svg" alt="TMDB" width={92} height={12} />
    </a>
  </footer>;
}
