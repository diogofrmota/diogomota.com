"use client";
import { useState } from "react";
import styles from "./Avatar.module.css";

/**
 * Someone's profile picture, or the first letter of their username without
 * one (or when it doesn't load: a file lost with a volume, say). Decorative:
 * their name is always beside it, or names what it is in. The size, shape and
 * colors of the letter come from `className`; the picture fills that circle.
 */
export function Avatar({ username, url, className = "", style }: {
  username: string;
  url?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const picture = url && failed !== url ? url : null;
  return (
    <span aria-hidden="true" className={`${className} ${picture ? styles.withPicture : ""}`} style={style}>
      {picture ? (
        // The picture is already small and square (lib/avatars.ts), and
        // private: next/image's optimizer would only fetch it again.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture} alt="" className={styles.picture} decoding="async" draggable={false}
          onError={() => setFailed(picture)} />
      ) : (
        username.charAt(0).toUpperCase()
      )}
    </span>
  );
}
