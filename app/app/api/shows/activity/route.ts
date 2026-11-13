import { friendsActivity } from "@/lib/activity";
import { showsRoute } from "@/lib/shows";

// GET /api/shows/activity: what your friends did in Shows lately (lib/activity.ts), newest first.
export const GET = showsRoute({}, ({ user }) => friendsActivity(user.id));
