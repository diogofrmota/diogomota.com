import { spaceActivity } from "@/lib/activity";
import { apiRoute } from "@/lib/http";
import { inSpace } from "@/lib/spaces";

// GET /api/shared/activity: what the space's members did lately (lib/activity.ts), newest first.
export const GET = apiRoute({ label: "Reading the space's activity" }, ({ user }) =>
  inSpace(user.id, (db, space) => spaceActivity(db, space.id)),
);
