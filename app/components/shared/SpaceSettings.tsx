"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Spinner } from "@/components/common/Spinner";
import ui from "@/components/common/ui.module.css";
import { memberColors, type Invite, type Space } from "@/lib/space-types";
import { spaceRequest } from "./space-request";
import styles from "./Spaces.module.css";

/** The card an action was made in, where what it did (or why not) is shown. */
type Card = "name" | "invite" | "leave";
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
  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name");
    void run("name", async () => { onChange(await spaceRequest<Space>(`/${space.id}`, "PATCH", { name })); return "Space name saved."; });
  }
  const status = (card: Card) => <>
    {pending === card && <Spinner label="Saving…" />}
    {notice?.card === card && <NoticeLine notice={notice} />}
  </>;

  return <>
    <form className={ui.card} onSubmit={rename}>
      <h2 className={ui.cardHeading}>Your space</h2>
      <div className={ui.field}>
        <label htmlFor="edit-space-name">Space name</label>
        <input key={space.name} id="edit-space-name" name="name" className={ui.input} defaultValue={space.name} required maxLength={80} disabled={!owner || busy} />
      </div>
      {owner ? <button className={`${ui.button} ${ui.primary}`} disabled={busy}>Save name</button>
        : <p className={ui.muted}>Only the owner can change the name and invite people.</p>}
      {status("name")}
    </form>
    <section className={ui.card} aria-labelledby="members-heading">
      <h2 id="members-heading" className={ui.cardHeading}>Members</h2>
      <ul className={styles.members}>{space.members.map((member) => <li key={member.id}>
        <span className={styles.swatch} style={{ backgroundColor: member.color }} aria-hidden="true" />
        <span className={styles.memberName}>{member.username}{member.id === userId ? " (you)" : ""}
          <small>{memberColors.find((color) => color.hex === member.color)?.name ?? member.color}</small></span>
        <span className={styles.role}>{member.role}</span>
      </li>)}</ul>
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
      {confirmLeave ? <div className={ui.confirm}><p>Leave {space.name}?</p>
        <div className={ui.actions}>
          <button className={`${ui.button} ${ui.danger}`} disabled={busy}
            onClick={() => run("leave", async () => { await spaceRequest(`/${space.id}/leave`, "POST"); onChange(null); })}>Confirm leave</button>
          <button className={ui.button} disabled={busy} onClick={() => setConfirmLeave(false)}>Cancel</button>
        </div>
      </div> : <button className={`${ui.button} ${ui.remove}`} disabled={busy} onClick={() => setConfirmLeave(true)}>Leave space</button>}
      {status("leave")}
    </section>
  </>;
}

/**
 * Shared's settings, in Global Settings: the user's space (its name, members,
 * invites, leaving), or a way to Shared to create or join one.
 */
export function SpaceSettings({ initialSpace, userId }: { initialSpace: Space | null; userId: string }) {
  const [space, setSpace] = useState(initialSpace);
  // A new one each time the server renders the page again (the account menu's
  // link from this page, a saved theme), and as new as any loaded here.
  const [rendered, setRendered] = useState(initialSpace);
  if (initialSpace !== rendered) {
    setRendered(initialSpace);
    setSpace(initialSpace);
  }
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  // Loaded again whenever Shared is picked (Activity resumes this effect), so
  // what other members changed meanwhile shows.
  useEffect(() => {
    let active = true;
    spaceRequest<Space | null>().then((current) => { if (active) { setLoadError(""); setSpace(current); } })
      .catch((err) => { if (active) setLoadError((err as Error).message); });
    return () => { active = false; };
  }, [attempt]);

  return <div className={ui.stack}>
    {loadError && <div role="alert" className={ui.alert}><p className={ui.alertText}>{loadError}</p>
      <button className={ui.button} onClick={() => { setLoadError(""); setAttempt((n) => n + 1); }}>Retry</button></div>}
    {space ? <SpaceCards space={space} userId={userId} onChange={setSpace} />
      : <section className={ui.card} aria-labelledby="no-space-heading">
        <h2 id="no-space-heading" className={ui.cardHeading}>No space yet</h2>
        <p className={ui.muted}>Create a space, or join one with an invite code, in Shared. Its settings are here once you have one.</p>
        <Link href="/shared" className={`${ui.button} ${ui.primary}`}>Open Shared</Link>
      </section>}
  </div>;
}
