import { searchPeople } from "@/lib/friends";
import { showsRoute } from "@/lib/shows";

// GET /api/shows/friends/search?q=: people whose username or name starts with q, for Add a friend.
export const GET = showsRoute({}, ({ user, searchParams }) => searchPeople(user.id, searchParams.get("q")));
