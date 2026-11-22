import Link from "next/link";
import { Avatar } from "@/components/common/Avatar";
import { SettingsIcon } from "@/components/common/icons";
import { LinkPending } from "@/components/common/LinkPending";
import ui from "@/components/common/ui.module.css";
import styles from "./ProfileHeader.module.css";

/**
 * The top of /, logged in: who is here, in the middle. Their profile picture
 * (or initials), their name (their username without one), "(@username)", and
 * Account settings, the way to /account (home has no top bar).
 */
export function ProfileHeader({
  username,
  name,
  avatarUrl,
}: {
  username: string;
  name: string | null;
  avatarUrl: string | null;
}) {
  return (
    <header className={styles.profile}>
      <Avatar username={username} name={name} url={avatarUrl} className={styles.avatar} />
      <h1 className={styles.name}>{name?.trim() || username}</h1>
      <p className={styles.username}>(@{username})</p>
      <Link href="/account" className={`${ui.button} ${styles.account}`}>
        <LinkPending icon={<SettingsIcon />} />
        Account settings
      </Link>
    </header>
  );
}
