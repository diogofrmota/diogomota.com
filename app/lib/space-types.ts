// Distinct swatches, always paired with a name: color is never the only label.
// Mid-tone colors remain visible against both the light and dark surfaces.
export const memberColors = [
  { hex: "#4477AA", name: "Blue" }, { hex: "#EE6677", name: "Rose" },
  { hex: "#228833", name: "Green" }, { hex: "#CCBB44", name: "Gold" },
  { hex: "#66CCEE", name: "Cyan" }, { hex: "#AA3377", name: "Purple" },
  { hex: "#BBBBBB", name: "Silver" }, { hex: "#EE7733", name: "Orange" },
  { hex: "#009988", name: "Teal" }, { hex: "#997700", name: "Ochre" },
] as const;

// No name: a space is its members, calendar and task lists.
export type Space = {
  id: string; ownerId: string;
  /** With their profile picture (lib/users.ts), or null for their initial. */
  members: { id: string; username: string; avatarUrl: string | null; color: string; role: "owner" | "member" }[];
};
export type Invite = { code: string; expiresAt: string };
