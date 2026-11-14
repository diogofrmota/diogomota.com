"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState, type DragEvent } from "react";
import {
  avatarChanged,
  changeEmail,
  changeName,
  changePassword,
  changeUsername,
  deleteAccount,
  logOut,
  resendVerification,
  saveTheme,
} from "@/app/account/actions";
import { AvatarCrop } from "@/components/account/AvatarCrop";
import { LogoutButton } from "@/components/account/LogoutButton";
import { Avatar } from "@/components/common/Avatar";
import { clearOfflineData } from "@/components/common/QueryProvider";
import { Dialog } from "@/components/common/Dialog";
import { ChevronRightIcon, CloseIcon, PencilIcon, PhotoIcon } from "@/components/common/icons";
import { InlineSpinner, PendingOverlay } from "@/components/common/Spinner";
import { ThemeOptions } from "@/components/common/ThemePicker";
import ui from "@/components/common/ui.module.css";
import { Field, FormMessage, SubmitButton } from "@/components/site/Form";
import formStyles from "@/components/site/Form.module.css";
import {
  AVATAR_MAX_BYTES,
  EMAIL_MAX,
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
import { isTheme, themes, type Theme } from "@/lib/themes";
import styles from "./AccountSettings.module.css";

/** Called with what a form saved ("Name saved."), once it has: its popup then closes. */
type OnSaved = (message: string) => void;

/** useActionState for a form in a popup: the server action, then `onSaved` once it says it saved. */
function useSavingAction(action: (previous: FormState, formData: FormData) => Promise<FormState>, onSaved: OnSaved) {
  return useActionState(async (previous: FormState, formData: FormData) => {
    const result = await action(previous, formData);
    if (result.success) onSaved(result.success);
    return result;
  }, {});
}

function UsernameForm({ username, onSaved }: { username: string; onSaved: OnSaved }) {
  const [state, action, pending] = useSavingAction(changeUsername, onSaved);
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
  const error =
    validation || savedError || (changed && result?.available === false ? "That username is taken." : undefined);
  const message =
    error ||
    (showSavedResult && state.error) ||
    (showSavedResult && !changed && state.success) ||
    (changed
      ? result?.error || (result?.available ? "That username is available." : "Checking availability…")
      : usernameHint);

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
          setCheck({
            username: normalized,
            error:
              error instanceof ApiError ? error.message : "Couldn't check availability. Try again or save to check.",
          });
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
          data-autofocus
          minLength={USERNAME_MIN}
          maxLength={USERNAME_MAX}
          value={value}
          onChange={(event) => {
            setDraft({ value: event.target.value, previous: state });
            setCheck(null);
          }}
        />
        <p
          id={statusId}
          role="status"
          className={error || (changed && result?.error) ? formStyles.error : formStyles.hint}
        >
          {message}
        </p>
      </div>
      <SubmitButton label="Save username" pending={pending} />
    </form>
  );
}

/** Their name, as they want it ("Diogo" or "Diogo Mota"), shown with the username in both apps. */
function NameForm({ name, onSaved }: { name: string | null; onSaved: OnSaved }) {
  const [state, action, pending] = useSavingAction(changeName, onSaved);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className={formStyles.form}>
      <Field
        label="Name"
        hideLabel
        name="name"
        error={errors.name}
        autoComplete="name"
        required
        data-autofocus
        maxLength={NAME_MAX}
        defaultValue={state.values?.name ?? name ?? ""}
      />
      <p className={formStyles.hint}>
        Your friends in Shows and the people in your shared space see it, with your username.
      </p>
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label="Save name" pending={pending} />
    </form>
  );
}

/** The email they log in with and get password resets at. Changing it takes the current password. */
function EmailForm({ email, onSaved }: { email: string; onSaved: OnSaved }) {
  const [state, action, pending] = useSavingAction(changeEmail, onSaved);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} noValidate className={formStyles.form}>
      <Field
        label="Email"
        name="email"
        type="email"
        error={errors.email}
        autoComplete="email"
        required
        maxLength={EMAIL_MAX}
        data-autofocus
        defaultValue={state.values?.email ?? email}
      />
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        hint="To check it's you: you log in with your email, and password resets go to it. We send a link to the new email, and it changes once you open it."
        error={errors.currentPassword}
        autoComplete="current-password"
        required
      />
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label="Save email" pending={pending} />
    </form>
  );
}

// On success it logs out everywhere, this device too, so it has no onSaved.
function PasswordForm() {
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
        data-autofocus
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
      <p className={`${formStyles.hint} ${styles.forgot}`}>
        Don&apos;t know your current password? <Link href="/forgot-password">Reset it by email</Link>
      </p>
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
 * then, once the page and the account menu have the saved one (avatarChanged),
 * `onSaved`. Remove picture goes back to the initial.
 */
function AvatarForm({
  username,
  avatarUrl,
  onSaved,
}: {
  username: string;
  avatarUrl: string | null;
  onSaved: OnSaved;
}) {
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

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(
    () => () => {
      if (cropping) URL.revokeObjectURL(cropping.url);
    },
    [cropping],
  );

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
      // So the page has the new one when the popup closes. It is saved either way.
      await avatarChanged().catch(() => {});
      onSaved(file ? "Profile picture saved." : "Profile picture removed.");
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
          {pending === "upload" && (
            <span className={styles.avatarBusy}>
              <InlineSpinner />
            </span>
          )}
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
            <span className={styles.dropAction}>{shown ? "Choose a new photo" : "Choose a photo"}</span> or drag one
            here
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
      {cropping && (
        <AvatarCrop
          src={cropping.url}
          onCancel={() => setCropping(null)}
          onSave={(picture) => {
            setCropping(null);
            void send("upload", picture);
          }}
          onUnreadable={() => {
            setCropping(null);
            void send("upload", cropping.file);
          }}
        />
      )}
      <p role="status" className={ui.srOnly}>
        {pending === "upload" ? "Saving your picture…" : ""}
      </p>
      <FormMessage error={result.error} success={result.success} />
      {shown && !preview && (
        <button
          type="button"
          className={`${ui.button} ${ui.remove}`}
          disabled={pending !== null}
          aria-busy={pending === "remove"}
          onClick={() => void send("remove")}
        >
          Remove picture
          <PendingOverlay pending={pending === "remove"} />
        </button>
      )}
    </div>
  );
}

// `labelledBy` is the id of the popup's heading, which names the radio group.
function ThemeForm({ theme, labelledBy, onSaved }: { theme: Theme; labelledBy: string; onSaved: OnSaved }) {
  const [state, action, pending] = useSavingAction(saveTheme, onSaved);
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

/**
 * Delete my account, after the password: it leaves its space (the space goes with
 * its last member), and the library, friends and activity go with it. It can't be
 * undone, so the button says so.
 */
function DeleteForm() {
  const [state, action, pending] = useActionState(deleteAccount, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} noValidate className={formStyles.form} onSubmit={clearOfflineData}>
      <p>
        This deletes your account and everything it has here: your library, friends, recommendations and activity. You
        leave your Shared space; if you&rsquo;re its last member, its calendar and tasks are deleted too. It can&rsquo;t
        be undone. <Link href="/api/account/export">Download your data</Link> first if you want to keep it.
      </p>
      <Field
        label="Password"
        name="password"
        type="password"
        error={errors.password}
        autoComplete="current-password"
        required
        data-autofocus
      />
      <FormMessage error={state.error} />
      <SubmitButton label="Delete my account" pending={pending} danger />
    </form>
  );
}

/** Not confirmed yet: the link went to their email; this sends another. */
function VerifyEmail({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resendVerification, {});
  return (
    <form action={action} className={styles.verify}>
      <p>
        Confirm your email: we sent a link to <strong>{email}</strong>. Until you open it, password resets don&rsquo;t
        go to it.
      </p>
      <FormMessage error={state.error} success={state.success} />
      <SubmitButton label="Send the link again" pending={pending} />
    </form>
  );
}

type Setting = "avatar" | "name" | "username" | "email" | "theme" | "password" | "delete";

const titles: Record<Setting, string> = {
  avatar: "Profile picture",
  name: "Name",
  username: "Username",
  email: "Email",
  theme: "Theme",
  password: "Update password",
  delete: "Delete my account",
};

/**
 * Account's settings: the profile picture, in the middle; then a row each for
 * the name, username, email and theme, with what they are now; then Update
 * password and Log out; then Your data: Download my data and Delete my
 * account. Each opens a popup with its form (Escape, a click outside or its ×
 * close it), which closes once saved, saying so under the rows; the page then
 * shows the new value. An email not confirmed yet says so, with a way to send
 * the link again; `message` is what an emailed link did (it came back here).
 */
export function AccountSettings({
  user,
  message,
}: {
  user: {
    username: string;
    email: string;
    emailVerified: boolean;
    name: string | null;
    avatarUrl: string | null;
    themePreference: Theme;
  };
  message?: string;
}) {
  const [open, setOpen] = useState<Setting | null>(null);
  const [notice, setNotice] = useState(message ?? "");
  const headingId = useId();
  const show = (setting: Setting) => {
    setNotice("");
    setOpen(setting);
  };
  const close = () => setOpen(null);
  const saved = (message: string) => {
    setOpen(null);
    setNotice(message);
  };
  const rows: { id: Setting; value: string | null }[] = [
    { id: "name", value: user.name },
    { id: "username", value: user.username },
    { id: "email", value: user.emailVerified ? user.email : `${user.email} (not confirmed)` },
    { id: "theme", value: themes.find((theme) => theme.id === user.themePreference)?.name ?? null },
  ];

  return (
    <>
      <div className={styles.profile}>
        <button type="button" className={styles.avatarButton} aria-haspopup="dialog" onClick={() => show("avatar")}>
          <Avatar username={user.username} url={user.avatarUrl} className={styles.profileAvatar} />
          <span className={styles.avatarEdit} aria-hidden="true">
            <PencilIcon />
          </span>
          <span className={ui.srOnly}>Profile picture</span>
        </button>
      </div>

      <ul className={styles.list}>
        {rows.map(({ id, value }) => (
          <li key={id}>
            <button
              type="button"
              className={styles.row}
              data-press="wide"
              aria-haspopup="dialog"
              onClick={() => show(id)}
            >
              <span className={styles.rowTitle}>{titles[id]}</span>
              <span className={ui.srOnly}>: </span>
              <span className={value ? styles.rowValue : `${styles.rowValue} ${styles.rowEmpty}`}>
                {value ?? "Not set"}
              </span>
              <span className={styles.rowChevron} aria-hidden="true">
                <ChevronRightIcon />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!user.emailVerified && <VerifyEmail email={user.email} />}

      {/* What the last popup saved; always there, so it is read out when it changes. */}
      <p role="status" className={notice ? `${ui.success} ${styles.notice}` : ui.srOnly}>
        {notice}
      </p>

      <div className={styles.buttons}>
        <button type="button" className={ui.button} aria-haspopup="dialog" onClick={() => show("password")}>
          Update password
        </button>
        <form action={logOut}>
          <LogoutButton className={ui.button} />
        </form>
      </div>

      {/* Your data (privacy): a copy of it all, or deleting it all. */}
      <section className={styles.data} aria-labelledby="your-data">
        <h2 id="your-data">Your data</h2>
        <p className={ui.muted}>
          What we keep and why is in <Link href="/privacy">Privacy</Link>.
        </p>
        <div className={styles.buttons}>
          <a href="/api/account/export" download className={ui.button}>
            Download my data
          </a>
          <button
            type="button"
            className={`${ui.button} ${ui.remove}`}
            aria-haspopup="dialog"
            onClick={() => show("delete")}
          >
            Delete my account
          </button>
        </div>
      </section>

      {open && (
        <Dialog
          key={open}
          className={`${styles.dialog} ${open === "theme" ? styles.wideDialog : ""}`}
          aria-labelledby={headingId}
          onClose={close}
        >
          <div className={styles.dialogBody}>
            <div className={styles.dialogHeader}>
              <h2 id={headingId}>{titles[open]}</h2>
              <button type="button" className={styles.close} aria-label="Close" onClick={close}>
                <CloseIcon />
              </button>
            </div>
            {open === "avatar" ? (
              <AvatarForm username={user.username} avatarUrl={user.avatarUrl} onSaved={saved} />
            ) : open === "name" ? (
              <NameForm name={user.name} onSaved={saved} />
            ) : open === "username" ? (
              <UsernameForm username={user.username} onSaved={saved} />
            ) : open === "email" ? (
              <EmailForm email={user.email} onSaved={saved} />
            ) : open === "theme" ? (
              <ThemeForm theme={user.themePreference} labelledBy={headingId} onSaved={saved} />
            ) : open === "delete" ? (
              <DeleteForm />
            ) : (
              <PasswordForm />
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
