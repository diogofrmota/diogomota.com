"use client";
import { useState, type FormEvent } from "react";
import type { Space } from "@/lib/space-types";
import { spaceRequest } from "./space-request";
import styles from "./Spaces.module.css";

export function SpaceWelcome({ onJoined }: { onJoined: (space: Space) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>, join: boolean) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const space = await spaceRequest<Space>(join ? "/join" : "", "POST", join ? { code: values.get("code") } : { name: values.get("name") });
      onJoined(space);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not connect. Try again."); }
    finally { setBusy(false); }
  }
  return <section className={styles.view}>
    <p className={styles.eyebrow}>A little more together</p><h1>Your shared space</h1>
    <p>One place for your group’s plans and lists. Create a space, or join someone you know.</p>
    <div className={styles.options}>
      <form className={styles.card} onSubmit={(event) => submit(event, false)}>
        <h2>Create a Space</h2><label htmlFor="space-name">Space name</label>
        <input id="space-name" name="name" required maxLength={80} placeholder="Home, together" disabled={busy} />
        <button disabled={busy}>Create a Space</button>
      </form>
      <form className={styles.card} onSubmit={(event) => submit(event, true)}>
        <h2>Join with Code</h2><label htmlFor="join-code">Invite code</label>
        <input id="join-code" name="code" required maxLength={16} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="8-character code" disabled={busy} />
        <button disabled={busy}>Join with Code</button>
      </form>
    </div>
    {busy && <p role="status">Opening your space…</p>}{error && <p role="alert">{error}</p>}
    <p className={styles.note}>You can belong to one space at a time.</p>
  </section>;
}
