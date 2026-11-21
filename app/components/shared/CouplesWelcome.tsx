"use client";
import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { Spinner } from "@/components/common/Spinner";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { AppPreview } from "@/components/site/AppPreview";
import type { Space } from "@/lib/space-types";
import { sharedRequest } from "./shared-data";
import styles from "./Spaces.module.css";

const subscribeNever = () => () => {};

/**
 * Before there is a group: what For Couples is (a calendar, task lists and
 * recipes for a couple), then the two ways in: create one, and invite your
 * partner from it, or join theirs with the code from their invite. As a page
 * (Calendar, Tasks, Recipes and the group's settings without a group), with
 * its heading and a picture of Calendar; or in For Couples' folder on home
 * (`popup`), under the folder's own title, its two ways one over the other.
 * `busy` is for what comes after (home loading again with the group).
 */
export function CouplesWelcome({
  onJoined,
  variant = "page",
  busy: after = false,
}: {
  onJoined: (space: Space) => void;
  variant?: "page" | "popup";
  busy?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Rendered by the server: until hydrated, a press would send the form as a
  // page load (to ?, losing it), so the buttons wait.
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const id = useId();
  const popup = variant === "popup";
  const Heading = popup ? "h3" : "h2";
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
  const working = busy || after;
  const disabled = working || !hydrated;
  return (
    <section className={popup ? styles.welcomePopup : ui.view}>
      {!popup && <h1 className={ui.heading}>For Couples</h1>}
      <p className={ui.muted}>
        A calendar, task lists and recipes for the two of you, with one shopping list. Create a group and invite your
        partner, or join theirs with the code from their invite.
      </p>
      {!popup && <AppPreview href="/calendar" className={styles.preview} />}
      <div className={styles.options}>
        <form className={ui.card} onSubmit={(event) => submit(event, false)}>
          <Heading className={ui.cardHeading}>Create a group</Heading>
          <p className={ui.muted}>Your calendar, tasks and recipes, then a link to send your partner.</p>
          <Button variant="primary" type="submit" disabled={disabled}>
            Create a group
          </Button>
        </form>
        <form className={ui.card} onSubmit={(event) => submit(event, true)}>
          <Heading className={ui.cardHeading}>Join your partner&rsquo;s group</Heading>
          <div className={ui.field}>
            <label htmlFor={`${id}-code`}>Invite code</label>
            <input
              id={`${id}-code`}
              name="code"
              className={ui.input}
              required
              // Room for the whole invite link pasted in: the server reads the code out of it (inviteCodeOf).
              maxLength={300}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="8-character code, or the link"
              disabled={working}
            />
          </div>
          <Button variant="primary" type="submit" disabled={disabled}>
            Join group
          </Button>
        </form>
      </div>
      {working && <Spinner label="Opening your group…" />}
      {error && <Alert className={styles.welcomeError}>{error}</Alert>}
      <p className={ui.note}>A group is two people, and you can be in one at a time.</p>
    </section>
  );
}
