"use client";

import { useActionState, useEffect, useId, useState, type DragEvent } from "react";
import { avatarChanged, changeName, changePassword, changeUsername, saveTheme } from "@/app/account/actions";
import { AvatarCrop } from "@/components/account/AvatarCrop";
import { Avatar } from "@/components/common/Avatar";
import { PhotoIcon } from "@/components/common/icons";
import { InlineSpinner, PendingOverlay } from "@/components/common/Spinner";
import { ThemeOptions } from "@/components/common/ThemePicker";
import ui from "@/components/common/ui.module.css";
import { Field, FormMessage, SubmitButton } from "@/components/site/Form";
import formStyles from "@/components/site/Form.module.css";
import {
  AVATAR_MAX_BYTES,
  NAME_MAX,
  PASSWORD_MIN,
  normalizeUsername,
  passwordHint,
  USERNAME_MAX,
  USERNAME_MIN,
  usernameHint,
  usernameError,
} from "@/lib/account-rules";
import { ApiError, apiRequest } from "@/lib/api-request";
import type { FormState } from "@/lib/form-state";
import { isTheme, type Theme } from "@/lib/themes";
import styles from "./AccountSettings.module.css";

export function UsernameForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState(changeUsername, {});
  const [draft, setDraft] = useState<{ value: string; previous: FormState } | null>(null);
  const [check, setCheck] = useState<{ username: string; available?: boolean; error?: string } | null>(null);
  const statusId = useId();
  const value = draft?.value ?? username;
  const normalized = normalizeUsername(value);
  const validation = draft ? usernameError(normalized) : null;
  const changed = normalized !== username;
  const showSavedResult = !draft || draft.previous !== state;
  const savedError = showSavedResult && state.values?.username === normalized ? state.fieldErrors?.username : undefined;
  const result = check?.username === normalized ? check : null;
  const error = validation || savedError || (changed && result?.available === false ? "That username is taken." : undefined);
  const message = error || (showSavedResult && state.error)
    || (showSavedResult && !changed && state.success)
    || (changed ? result?.error || (result?.available ? "That username is available." : "Checking availability…") : usernameHint);

  useEffect(() => {
    if (!changed || usernameError(normalized)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await apiRequest<{ available: boolean }>(
          `/api/account/username?${new URLSearchParams({ username: normalized })}`,
          { signal: controller.signal, fallback: "Couldn't check availability. Try again or save to check." },
        );
        if (!controller.signal.aborted) setCheck({ username: normalized, available: data.available });
      } catch (error) {
        if (!controller.signal.aborted) {
          setCheck({ username: normalized, error: error instanceof ApiError ? error.message : "Couldn't check availability. Try again or save to check." });
        }
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [changed, normalized, value]);

  return (
    <form action={action} noValidate className={formStyles.form}>
      <div className={formStyles.field}>
        <Field
          label="Username"
          hideLabel
          name="username"
          aria-describedby={statusId}
          aria-invalid={error ? true : undefined}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={USERNAME_MIN}
          maxLength={USERNAME_MAX}
          value={value}
          onChange={(event) => {
            setDraft({ value: event.target.value, previous: state });
            setCheck(null);
          }}
        />
        <p id={statusId} role="status" className={error || (changed && result?.error) ? formStyles.error : formStyles.hint}>
          {message}
        </p>
      </div>
      <SubmitButton label="Save username" pending={pending} />
    </form>
  );
}

/** First and last name (the last is optional), shown with the username in both apps. */
export function NameForm({ firstName, lastName }: { firstName: string | null; lastName: string | null }) {
  const [state, action, pending] = useActionState(changeName, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className={formStyles.form}>
      <div className={formStyles.row}>
        <Field
          label="First name"
          name="firstName"
          error={errors.firstName}
          autoComplete="given-name"
          required
          maxLength={NAME_MAX}
          defaultValue={state.values?.firstName ?? firstName ?? ""}
        />
        <Field
          label="Last name (optional)"
          name="lastName"
          error={errors.lastName}
          autoComplete="family-name"
          maxLength={NAME_MAX}
          defaultValue={state.values?.lastName ?? lastName ?? ""}
        />
      </div>
      <p className={formStyles.hint}>Your friends in Shows and the people in your shared space see it, with your username.</p>
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label="Save name" pending={pending} />
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className={formStyles.form}>
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        error={errors.currentPassword}
        autoComplete="current-password"
        required
      />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        hint={passwordHint}
        error={errors.newPassword}
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN}
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        error={errors.confirmPassword}
        autoComplete="new-password"
        required
      />
      <p className={formStyles.hint}>Changing password logs you out on every device.</p>
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label="Change password" pending={pending} />
    </form>
  );
}

const avatarMaxMb = AVATAR_MAX_BYTES / 1024 / 1024;

/**
 * The profile picture: the one there is (or the username's initial), and a
 * place to drop a photo or tap to choose one. A photo opens Adjust your
 * picture (AvatarCrop), to move and zoom it until the circle shows the part
 * wanted; Save picture sends that square, which the server makes small
 * (lib/avatars.ts). While it goes, it shows in the circle, under a spinner;
 * then the saved one, and the account menu has it too (avatarChanged). Remove
 * picture goes back to the initial.
 */
export function AvatarForm({ username, avatarUrl }: { username: string; avatarUrl: string | null }) {
  const hintId = useId();
  // The photo being sent (an object URL), and the URL saved since the page loaded.
  const [preview, setPreview] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [pending, setPending] = useState<"upload" | "remove" | null>(null);
  const [result, setResult] = useState<{ error?: string; success?: string }>({});
  const [dragging, setDragging] = useState(false);
  // The photo chosen, being adjusted, and its object URL.
  const [cropping, setCropping] = useState<{ file: File; url: string } | null>(null);
  const shown = preview ?? (saved === undefined ? avatarUrl : saved);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (cropping) URL.revokeObjectURL(cropping.url); }, [cropping]);

  async function send(change: "upload" | "remove", file?: File) {
    setPending(change);
    setResult({});
    if (file) setPreview(URL.createObjectURL(file));
    try {
      let body: FormData | undefined;
      if (file) {
        body = new FormData();
        body.append("picture", file);
      }
      const data = await apiRequest<{ avatarUrl: string | null }>("/api/account/avatar", {
        method: file ? "POST" : "DELETE",
        body,
        fallback: file ? "Couldn't save the picture. Try again." : "Couldn't remove the picture. Try again.",
      });
      setSaved(data.avatarUrl);
      setResult({ success: file ? "Profile picture saved." : "Profile picture removed." });
      void avatarChanged();
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Couldn't save the picture. Try again." });
    } finally {
      setPending(null);
      setPreview(null);
    }
  }

  function choose(file: File | undefined) {
    if (!file || pending || cropping) return;
    // Some systems give no type for a photo (HEIC, say): the browser tries it,
    // and if it can't show it, the server decides.
    if (file.type && !file.type.startsWith("image/")) {
      setResult({ error: "That isn't a picture. Choose a JPEG, PNG or WebP." });
    } else if (file.size > AVATAR_MAX_BYTES) {
      setResult({ error: `That picture is over ${avatarMaxMb} MB. Try a smaller one.` });
    } else {
      setResult({});
      setCropping({ file, url: URL.createObjectURL(file) });
    }
  }

  function dragOver(event: DragEvent<HTMLLabelElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = pending ? "none" : "copy";
    setDragging(true);
  }

  return (
    <div className={formStyles.form}>
      <div className={styles.avatarRow}>
        <span className={styles.avatarFrame}>
          <Avatar username={username} url={shown} className={styles.avatar} />
          {pending === "upload" && <span className={styles.avatarBusy}><InlineSpinner /></span>}
        </span>
        {/* The input is in the label, so a click or tap anywhere on it chooses a
            file, and its focus ring goes around the whole drop zone. */}
        <label
          className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`}
          aria-disabled={pending !== null}
          onDragEnter={dragOver}
          onDragOver={dragOver}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files[0]);
          }}
        >
          <PhotoIcon />
          <span className={styles.dropText}>
            <span className={styles.dropAction}>{shown ? "Choose a new photo" : "Choose a photo"}</span> or drag one here
          </span>
          <input
            type="file"
            accept="image/*"
            className={ui.srOnly}
            aria-describedby={hintId}
            disabled={pending !== null}
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <p id={hintId} className={formStyles.hint}>
        JPEG, PNG or WebP, up to {avatarMaxMb} MB. You choose the part of it to show, and it&apos;s made smaller. Your
        friends in Shows and the people in your shared space see it.
      </p>
      {cropping && <AvatarCrop src={cropping.url} onCancel={() => setCropping(null)}
        onSave={(picture) => { setCropping(null); void send("upload", picture); }}
        onUnreadable={() => { setCropping(null); void send("upload", cropping.file); }} />}
      <p role="status" className={ui.srOnly}>{pending === "upload" ? "Saving your picture…" : ""}</p>
      <FormMessage error={result.error} success={result.success} />
      {shown && !preview && (
        <button type="button" className={`${ui.button} ${ui.remove}`} disabled={pending !== null}
          aria-busy={pending === "remove"} onClick={() => void send("remove")}>
          Remove picture
          <PendingOverlay pending={pending === "remove"} />
        </button>
      )}
    </div>
  );
}

// `labelledBy` is the id of the section heading, which names the radio group.
export function ThemeForm({ theme, labelledBy }: { theme: Theme; labelledBy: string }) {
  const [state, action, pending] = useActionState(saveTheme, {});
  const hintId = useId();
  const saved = state.values?.theme;
  const selected = isTheme(saved) ? saved : theme;

  return (
    <form action={action} className={formStyles.form}>
      <fieldset className={styles.fieldset} aria-labelledby={labelledBy} aria-describedby={hintId}>
        <p id={hintId} className={formStyles.hint}>
          Applies to both apps, and to this page.
        </p>
        <ThemeOptions defaultValue={selected} />
      </fieldset>
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label="Save theme" pending={pending} />
    </form>
  );
}
