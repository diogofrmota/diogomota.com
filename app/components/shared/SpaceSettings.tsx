"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { spaceChanged } from "@/app/shared/actions";
import { Avatar } from "@/components/common/Avatar";
import { PersonName } from "@/components/common/PersonName";
import { Spinner } from "@/components/common/Spinner";
import ui from "@/components/common/ui.module.css";
import type { Invite, Space } from "@/lib/space-types";
import { spaceRequest } from "./space-request";
import styles from "./Spaces.module.css";

/** The card an action was made in, where what it did (or why not) is shown. */
type Card = "invite" | "leave";
type Notice = { card: Card; text: string; error?: boolean };

function NoticeLine({ notice }: { notice: Notice }) {
  return <p role={notice.error ? "alert" : "status"} className={notice.error ? ui.alert : ui.success}>{notice.text}</p>;
}

function SpaceCards({ space, userId, onChange }: { space: Space; userId: string; onChange: (space: Space | null) => void }) {
  // The card whose action is running.
  const [pending, setPending] = useState<Card | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const owner = space.ownerId === userId;
  const busy = pending !== null;

  // `action` returns what to say once it's done, if anything.
  async function run(card: Card, action: () => Promise<string | void>) {
    setPending(card); setNotice(null);
    try {
      const text = await action();
      if (text) setNotice({ card, text });
    } catch (error) {
      setNotice({ card, text: error instanceof Error ? error.message : "Could not connect. Try again.", error: true });
    } finally { setPending(null); }
  }
  const status = (card: Card) => <>
    {pending === card && <Spinner label="Saving…" />}
    {notice?.card === card && <NoticeLine notice={notice} />}
  </>;

  return <>
    <section className={ui.card} aria-labelledby="members-heading">
      <h2 id="members-heading" className={ui.cardHeading}>Members</h2>
      {/* Each with their picture (or initial) in a ring of their color, as in
          the calendar, then their first name and @username; only the owner is marked. */}
      <ul className={styles.members}>{space.members.map((member) => <li key={member.id}>
        <Avatar username={member.username} url={member.avatarUrl} className={styles.memberAvatar}
          style={{ "--member-color": member.color } as CSSProperties} />
        <span className={styles.memberName}><PersonName person={member} first />{member.id === userId ? " (you)" : ""}</span>
        {member.role === "owner" && <span className={styles.role}>Owner</span>}
      </li>)}</ul>
      {!owner && <p className={ui.muted}>Only the owner can invite people.</p>}
    </section>
    {owner && <section className={ui.card} aria-labelledby="invite-heading">
      <h2 id="invite-heading" className={ui.cardHeading}>Invite people</h2>
      <p className={ui.muted}>Each code works once and expires after 24 hours. Spaces have room for 10 people.</p>
      <button className={`${ui.button} ${ui.primary}`} disabled={busy}
        onClick={() => run("invite", async () => { setInvite(await spaceRequest<Invite>(`/${space.id}/invites`, "POST")); })}>Generate invite</button>
      {invite && <div className={styles.invite}>
        <div className={ui.field}>
          <label htmlFor="generated-code">Invite code</label>
          <input id="generated-code" className={`${ui.input} ${styles.code}`} readOnly value={invite.code} />
        </div>
        <button className={ui.button} disabled={busy}
          onClick={() => run("invite", async () => { await navigator.clipboard.writeText(invite.code); return "Code copied."; })}>Copy code</button>
        <p className={ui.muted}>Expires <time dateTime={invite.expiresAt}>{new Date(invite.expiresAt).toLocaleString()}</time></p>
      </div>}
      {status("invite")}
    </section>}
    <section className={ui.card} aria-labelledby="leave-heading">
      <h2 id="leave-heading" className={ui.cardHeading}>Leave space</h2>
      <p className={ui.muted}>{space.members.length === 1 ? "You are the last member. Leaving deletes this space and its data." : owner ? "Ownership will pass to the member who joined earliest." : "You can create or join another space after leaving."}</p>
      {confirmLeave ? <div className={ui.confirm}><p>Leave this space?</p>
        <div className={ui.actions}>
          <button className={`${ui.button} ${ui.danger}`} disabled={busy}
            onClick={() => run("leave", async () => {
              await spaceRequest(`/${space.id}/leave`, "POST");
              onChange(null);
              void spaceChanged();
            })}>Confirm leave</button>
          <button className={ui.button} disabled={busy} onClick={() => setConfirmLeave(false)}>Cancel</button>
        </div>
      </div> : <button className={`${ui.button} ${ui.remove}`} disabled={busy} onClick={() => setConfirmLeave(true)}>Leave space</button>}
      {status("leave")}
    </section>
  </>;
}

/**
 * Shared's Settings tab: the space's members, invites and leaving. The space
 * is SharedApp's, and every change goes back to it (onChange): members who
 * came or went show in the other tabs, and leaving takes Shared back to
 * creating or joining a space.
 */
export function SpaceSettings({ space, userId, onChange }: {
  space: Space;
  userId: string;
  onChange: (space: Space | null) => void;
}) {
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Loaded again each time the tab is shown (Activity resumes this effect), so
  // what other members changed meanwhile shows.
  useEffect(() => {
    let active = true;
    spaceRequest<Space | null>().then((current) => { if (active) { setLoadError(""); onChange(current); } })
      .catch((err) => { if (active) setLoadError((err as Error).message); });
    return () => { active = false; };
  }, [attempt, onChange]);

  // The top bar's Settings tab names the view; the h1 is for screen readers.
  return <div className={ui.view}>
    <h1 className={ui.srOnly}>Settings</h1>
    <div className={ui.stack}>
      {loadError && <div role="alert" className={ui.alert}><p className={ui.alertText}>{loadError}</p>
        <button className={ui.button} onClick={() => { setLoadError(""); setAttempt((n) => n + 1); }}>Retry</button></div>}
      <SpaceCards space={space} userId={userId} onChange={onChange} />
    </div>
  </div>;
}
