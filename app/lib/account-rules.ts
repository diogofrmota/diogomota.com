// Rules for usernames, emails and passwords, shared by sign-up and account
// settings. Each check returns an error message for the form, or null.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 10;
// bcrypt only reads the first 72 bytes of a password, so longer ones are refused
// rather than silently cut.
export const PASSWORD_MAX_BYTES = 72;
export const EMAIL_MAX = 254;

export const usernameHint = `${USERNAME_MIN}-${USERNAME_MAX} characters: a-z, 0-9 and _.`;
export const passwordHint = `At least ${PASSWORD_MIN} characters.`;

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
