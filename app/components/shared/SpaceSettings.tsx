"use client";
import { useEffect, useState, type FormEvent } from "react";
import { memberColors, type Invite, type Space } from "@/lib/space-types";
import { spaceRequest } from "./space-request";
import styles from "./Spaces.module.css";

export function SpaceSettings({ space, userId, onChange }: { space: Space; userId: string; onChange: (space: Space | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const owner = space.ownerId === userId;
  // Activity resumes this effect whenever Settings is shown again.
  useEffect(() => {
    let active = true;
    spaceRequest<Space | null>().then((current) => { if (active) onChange(current); })
      .catch(() => { if (active) setError("Could not refresh members. Reopen Settings to try again."); });
    return () => { active = false; };
  }, [onChange]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not connect. Try again."); }
    finally { setBusy(false); }
  }
  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name");
    void run(async () => { onChange(await spaceRequest<Space>(`/${space.id}`, "PATCH", { name })); setMessage("Space name saved."); });
  }
  return <section className={styles.view}>
    <p className={styles.eyebrow}>{space.name}</p><h1>Settings</h1>
    <form className={styles.card} onSubmit={rename}>
      <h2>Your space</h2><label htmlFor="edit-space-name">Space name</label>
      <input key={space.name} id="edit-space-name" name="name" defaultValue={space.name} required maxLength={80} disabled={!owner || busy} />
      {owner ? <button disabled={busy}>Save name</button> : <p className={styles.note}>Only the owner can change the name and invite people.</p>}
    </form>
    <section className={styles.card} aria-labelledby="members-heading"><h2 id="members-heading">Members</h2>
      <ul className={styles.members}>{space.members.map((member) => <li key={member.id}>
        <span className={styles.swatch} style={{ backgroundColor: member.color }} aria-hidden="true" />
        <span className={styles.memberName}>{member.username}{member.id === userId ? " (you)" : ""}
          <small>{memberColors.find((color) => color.hex === member.color)?.name ?? member.color}</small></span>
        <span className={styles.role}>{member.role}</span>
      </li>)}</ul>
    </section>
    {owner && <section className={styles.card} aria-labelledby="invite-heading"><h2 id="invite-heading">Invite people</h2>
      <p>Each code works once and expires after 24 hours. Spaces have room for 10 people.</p>
      <button disabled={busy} onClick={() => run(async () => { setInvite(await spaceRequest<Invite>(`/${space.id}/invites`, "POST")); })}>Generate invite</button>
      {invite && <div className={styles.invite}>
        <label htmlFor="generated-code">Invite code</label><input id="generated-code" readOnly value={invite.code} />
        <button disabled={busy} onClick={() => run(async () => { await navigator.clipboard.writeText(invite.code); setMessage("Code copied."); })}>Copy code</button>
        <p>Expires <time dateTime={invite.expiresAt}>{new Date(invite.expiresAt).toLocaleString()}</time></p>
      </div>}
    </section>}
    <section className={styles.card} aria-labelledby="leave-heading"><h2 id="leave-heading">Leave space</h2>
      <p>{space.members.length === 1 ? "You are the last member. Leaving deletes this space and its data." : owner ? "Ownership will pass to the member who joined earliest." : "You can create or join another space after leaving."}</p>
      {confirmLeave ? <div className={styles.confirm}><p>Leave {space.name}?</p>
        <button disabled={busy} onClick={() => run(async () => { await spaceRequest(`/${space.id}/leave`, "POST"); onChange(null); })}>Confirm leave</button>
        <button disabled={busy} onClick={() => setConfirmLeave(false)}>Cancel</button>
      </div> : <button disabled={busy} onClick={() => setConfirmLeave(true)}>Leave space</button>}
    </section>
    {busy && <p role="status">Saving…</p>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
