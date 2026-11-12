// Rules for usernames, emails and passwords, shared by sign-up and account
// settings. Each check returns an error message for the form, or null.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 10;
// bcrypt only reads the first 72 bytes of a password, so longer ones are refused
// rather than silently cut.
export const PASSWORD_MAX_BYTES = 72;
export const EMAIL_MAX = 254;
/** The largest profile picture file accepted (lib/avatars.ts makes it small). nginx lets 21 MB through to its upload. */
export const AVATAR_MAX_BYTES = 20 * 1024 * 1024;

/** A first or a last name (013_names.sql). */
export const NAME_MAX = 50;

export const usernameHint = `${USERNAME_MIN}-${USERNAME_MAX} characters: a-z, 0-9 and _.`;
export const passwordHint = `At least ${PASSWORD_MIN} characters.`;

// Names are kept as typed, trimmed and with one space between words.
export function normalizeName(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function firstNameError(firstName: string): string | null {
  if (!firstName) return "Enter your first name.";
  if (firstName.length > NAME_MAX) return `Use at most ${NAME_MAX} characters.`;
  return null;
}

// The last name is optional.
export function lastNameError(lastName: string): string | null {
  return lastName.length > NAME_MAX ? `Use at most ${NAME_MAX} characters.` : null;
}

// Usernames are stored in lowercase, so "Diogo" signs up as "diogo".
export function normalizeUsername(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeEmail(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

// Passwords are taken as typed: spaces count.
export function formPassword(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export function usernameError(username: string): string | null {
  if (!username) return "Enter a username.";
  if (!new RegExp(`^[a-z0-9_]{${USERNAME_MIN},${USERNAME_MAX}}$`).test(username)) {
    return `Use ${usernameHint}`;
  }
  return null;
}

export function emailError(email: string): string | null {
  if (!email) return "Enter your email.";
  if (email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Enter a valid email, like name@example.com.";
  }
  return null;
}

export function passwordError(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `That password is too long (at most ${PASSWORD_MAX_BYTES} bytes).`;
  }
  return null;
}
