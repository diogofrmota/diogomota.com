"use client";
import { useState, type FormEvent } from "react";
import { Spinner } from "@/components/common/Spinner";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { AppPreview } from "@/components/site/AppPreview";
import type { Space } from "@/lib/space-types";
import { sharedRequest } from "./shared-data";
import styles from "./Spaces.module.css";

/**
 * Before there is a space: what Shared is (a calendar and task lists for a
 * couple), a picture of it (as on /apps), then the two ways in: start one, and
 * invite your partner from it, or join theirs with the code from their invite.
 */
export function SpaceWelcome({ onJoined }: { onJoined: (space: Space) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>, join: boolean) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const space = await sharedRequest<Space>(join ? "/spaces/join" : "/spaces", {
        method: "POST",
        body: join ? { code: values.get("code") } : {},
      });
      onJoined(space);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not connect. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={ui.view}>
      <h1 className={ui.heading}>Your shared calendar</h1>
      <p className={ui.muted}>
        One calendar and set of task lists for the two of you: dinners, trips, the bins and the shopping. Start yours
        and invite your partner, or join theirs with the code from their invite.
      </p>
      <AppPreview href="/shared" className={styles.preview} />
      <div className={styles.options}>
        <form className={ui.card} onSubmit={(event) => submit(event, false)}>
          <h2 className={ui.cardHeading}>Start your space</h2>
          <p className={ui.muted}>Your calendar and task lists, then a link to send your partner.</p>
          <Button variant="primary" type="submit" disabled={busy}>
            Create space
          </Button>
        </form>
        <form className={ui.card} onSubmit={(event) => submit(event, true)}>
          <h2 className={ui.cardHeading}>Have an invite code?</h2>
          <div className={ui.field}>
            <label htmlFor="join-code">Invite code</label>
            <input
              id="join-code"
              name="code"
              className={ui.input}
              required
              maxLength={16}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="8-character code"
              disabled={busy}
            />
          </div>
          <Button variant="primary" type="submit" disabled={busy}>
            Join space
          </Button>
        </form>
      </div>
      {busy && <Spinner label="Opening your space…" />}
      {error && <Alert className={styles.welcomeError}>{error}</Alert>}
      <p className={ui.note}>You can belong to one space at a time.</p>
    </section>
  );
}
