"use client";
import { useState, type FormEvent } from "react";
import { spaceChanged } from "@/app/shared/actions";
import { Spinner } from "@/components/common/Spinner";
import ui from "@/components/common/ui.module.css";
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
      void spaceChanged();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not connect. Try again."); }
    finally { setBusy(false); }
  }
  return <section className={ui.view}>
    <p className={ui.eyebrow}>A little more together</p>
    <h1 className={ui.heading}>Your shared space</h1>
    <p className={ui.muted}>One place for your group’s plans and lists. Create a space, or join someone you know.</p>
    <div className={styles.options}>
      <form className={ui.card} onSubmit={(event) => submit(event, false)}>
        <h2 className={ui.cardHeading}>Create a Space</h2>
        <div className={ui.field}>
          <label htmlFor="space-name">Space name</label>
          <input id="space-name" name="name" className={ui.input} required maxLength={80} placeholder="Home, together" disabled={busy} />
        </div>
        <button className={`${ui.button} ${ui.primary}`} disabled={busy}>Create a Space</button>
      </form>
      <form className={ui.card} onSubmit={(event) => submit(event, true)}>
        <h2 className={ui.cardHeading}>Join with Code</h2>
        <div className={ui.field}>
          <label htmlFor="join-code">Invite code</label>
          <input id="join-code" name="code" className={ui.input} required maxLength={16} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="8-character code" disabled={busy} />
        </div>
        <button className={`${ui.button} ${ui.primary}`} disabled={busy}>Join with Code</button>
      </form>
    </div>
    {busy && <Spinner label="Opening your space…" />}
    {error && <p role="alert" className={`${ui.alert} ${styles.welcomeError}`}>{error}</p>}
    <p className={ui.note}>You can belong to one space at a time.</p>
  </section>;
}
