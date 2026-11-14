"use client";
import { useState } from "react";
import { ShareIcon } from "@/components/common/icons";
import { CopiedIcon, useBriefly } from "@/components/common/motion";
import { Button, Notice } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { dateTimeLabel } from "@/lib/calendar";
import type { Invite, Space } from "@/lib/space-types";
import { sharedRequest } from "./shared-data";
import styles from "./Spaces.module.css";

/** The link that joins a space with an invite code (app/join/[code]). */
export const inviteUrl = (code: string) => new URL(`/join/${code}`, window.location.origin).href;

/**
 * Inviting someone: a new single-use link, valid for 24 hours, sent with the
 * phone's share sheet (Messages, WhatsApp...) where there is one, and copied
 * otherwise. The code is shown too, for typing on another device. Any member
 * can invite.
 */
export function InviteLink({ space, label = "Share invite link" }: { space: Space; label?: string }) {
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [copied, showCopied] = useBriefly();

  async function share() {
    setBusy(true);
    setNotice(null);
    try {
      const made = await sharedRequest<Invite>(`/spaces/${space.id}/invites`, { method: "POST" });
      setInvite(made);
      const url = inviteUrl(made.code);
      const text = "Join my shared calendar and lists on diogomota.com";
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: "Shared", text, url });
          setNotice({ text: "Invite sent. It works once, for 24 hours." });
        } catch (error) {
          // Closing the share sheet isn't an error: the link is below to copy.
          if ((error as Error).name !== "AbortError") throw error;
        }
      } else {
        await navigator.clipboard.writeText(url);
        setNotice({ text: "Link copied. Send it to them: it works once, for 24 hours." });
      }
    } catch (error) {
      setNotice({ text: (error as Error).message || "Could not make an invite. Try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(invite.code));
      setNotice({ text: "Link copied." });
      showCopied();
    } catch {
      setNotice({ text: "Couldn't copy the link. Select it and copy it instead.", error: true });
    }
  }

  return (
    <div className={styles.inviteLink}>
      <Button variant="primary" busy={busy} onClick={share}>
        <ShareIcon />
        {label}
      </Button>
      {invite && (
        <div className={styles.invite}>
          <div className={ui.field}>
            <label htmlFor="invite-url">Invite link</label>
            <input
              id="invite-url"
              className={ui.input}
              readOnly
              value={inviteUrl(invite.code)}
              onFocus={(e) => e.target.select()}
            />
          </div>
          <Button onClick={copy}>
            <CopiedIcon copied={copied} />
            Copy link
          </Button>
          <p className={ui.muted}>
            Or the code{" "}
            <strong className={styles.code}>
              <span className={styles.codeGroup}>{invite.code.slice(0, 4)}</span>
              <span className={styles.codeGroup}>{invite.code.slice(4)}</span>
            </strong>
            , in Join with a code. Works once, until{" "}
            <time dateTime={invite.expiresAt}>{dateTimeLabel(invite.expiresAt)}</time>.
          </p>
        </div>
      )}
      {notice && <Notice error={notice.error}>{notice.text}</Notice>}
    </div>
  );
}
