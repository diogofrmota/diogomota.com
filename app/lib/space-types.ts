import type { Named } from "./names";

// Distinct swatches, always paired with a name: color is never the only label.
// Mid-tone colors remain visible against both the light and dark surfaces.
export const memberColors = [
  { hex: "#4477AA", name: "Blue" },
  { hex: "#EE6677", name: "Rose" },
  { hex: "#228833", name: "Green" },
  { hex: "#CCBB44", name: "Gold" },
  { hex: "#66CCEE", name: "Cyan" },
  { hex: "#AA3377", name: "Purple" },
  { hex: "#BBBBBB", name: "Silver" },
  { hex: "#EE7733", name: "Orange" },
  { hex: "#009988", name: "Teal" },
  { hex: "#997700", name: "Ochre" },
] as const;

/** A group is two people: the one who made it and their partner (docs/decisions/0023). */
export const groupSize = 2;

// No name: a space (a group, in what people read) is its members, calendar,
// task lists and recipes.
export type Space = {
  id: string;
  ownerId: string;
  /** With their profile picture (lib/users.ts), or null for their initial, and their names (lib/names.ts). */
  members: (Named & { id: string; avatarUrl: string | null; color: string; role: "owner" | "member" })[];
};
export type Invite = { code: string; expiresAt: string };

/** An invite link's page, before joining (lib/spaces.ts, previewInvite). */
export type InvitePreview = {
  /** Who made it, or null for an older invite or a deleted account. */
  from: { name: string | null; username: string } | null;
  /** How many people the group has now. */
  members: number;
  /** "full": the group already has its two people. */
  state: "open" | "used" | "expired" | "gone" | "full";
};
