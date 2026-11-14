"use client";
import { useState } from "react";
import { initials } from "@/lib/names";
import styles from "./Avatar.module.css";

/**
 * Someone's profile picture, or their initials without one (or when it doesn't
 * load: a file lost with a volume, say), in a circle. Decorative: their name
 * is always beside it, or names what it is in. Its size, and its colors when
 * they differ, come from `className`; the circle itself is here, at zero
 * specificity, so every `className` wins over it.
 */
export function Avatar({
  username,
  name,
  url,
  className = "",
  style,
}: {
  username: string;
  /** Their name, for the initials; the username's first letter without one. */
  name?: string | null;
  url?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const picture = url && failed !== url ? url : null;
  const letters = initials(username, name);
  return (
    <span
      aria-hidden="true"
      className={`${styles.avatar} ${className} ${picture ? styles.withPicture : ""}`}
      data-initials={picture ? undefined : letters.length}
      style={style}
    >
      {picture ? (
        // The picture is already small and square (lib/avatars.ts), and
        // private: next/image's optimizer would only fetch it again.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={picture}
          alt=""
          className={styles.picture}
          decoding="async"
          draggable={false}
          onError={() => setFailed(picture)}
        />
      ) : (
        <span className={styles.letters}>{letters}</span>
      )}
    </span>
  );
}
