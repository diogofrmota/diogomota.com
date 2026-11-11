"use client";
import { useState, type FormEvent } from "react";
import { spaceChanged } from "@/app/shared/actions";
import { Spinner } from "@/components/common/Spinner";
import ui from "@/components/common/ui.module.css";
import { AppPreview } from "@/components/site/AppPreview";
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
      const space = await spaceRequest<Space>(join ? "/join" : "", "POST", join ? { code: values.get("code") } : {});
      onJoined(space);
      void spaceChanged();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not connect. Try again."); }
    finally { setBusy(false); }
  }
  // What a space is, a picture of one (as on /apps), then the two ways in. A
  // space has no name: creating one is a button.
  return <section className={ui.view}>
    <h1 className={ui.heading}>Start your shared space</h1>
    <p className={ui.muted}>One calendar and set of task lists for your group, up to 10 people. Create a space, or join one with an invite code.</p>
    <AppPreview href="/shared" className={styles.preview} />
    <div className={styles.options}>
      <form className={ui.card} onSubmit={(event) => submit(event, false)}>
        <h2 className={ui.cardHeading}>New space</h2>
        <p className={ui.muted}>Start a calendar and task lists of your own, then invite people from Settings.</p>
        <button className={`${ui.button} ${ui.primary}`} disabled={busy}>Create space</button>
      </form>
      <form className={ui.card} onSubmit={(event) => submit(event, true)}>
        <h2 className={ui.cardHeading}>Have an invite code?</h2>
        <div className={ui.field}>
          <label htmlFor="join-code">Invite code</label>
          <input id="join-code" name="code" className={ui.input} required maxLength={16} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="8-character code" disabled={busy} />
        </div>
        <button className={`${ui.button} ${ui.primary}`} disabled={busy}>Join space</button>
      </form>
    </div>
    {busy && <Spinner label="Opening your space…" />}
    {error && <p role="alert" className={`${ui.alert} ${styles.welcomeError}`}>{error}</p>}
    <p className={ui.note}>You can belong to one space at a time.</p>
  </section>;
}
