import Image from "next/image";
import styles from "./Shows.module.css";

// TMDB's terms (https://www.themoviedb.org/api-terms-of-use, section 3) require
// its logo, less prominent than the app's own name, and this notice wherever its
// data or images are shown. The logo file is TMDB's own, unchanged.
export function TmdbAttribution() {
  return <footer className={styles.attribution}>
    <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className={styles.tmdbLink}>
      <Image src="/logos/tmdb.svg" alt="TMDB" width={92} height={12} />
    </a>
    <p>This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.</p>
  </footer>;
}
