import Image from "next/image";
import styles from "./Shows.module.css";

// What TMDB's terms ask of every app that uses its data and posters
// (themoviedb.org/api-terms-of-use): its logo, less prominent than the app's
// own name, and that the app isn't endorsed by it. The logo file is TMDB's own,
// unchanged. At the bottom of Discover and of a title's panel.
export function TmdbAttribution() {
  return (
    <footer className={styles.attribution}>
      <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className={styles.tmdbLink}>
        <Image src="/logos/tmdb.svg" alt="TMDB" width={92} height={12} />
      </a>
      <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </footer>
  );
}
