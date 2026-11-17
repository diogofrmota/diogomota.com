import { searchPeople } from "@/lib/friends";
import { socialRoute } from "@/lib/social";

// GET /api/social/friends/search?q=: people whose username or name starts with q, for Add a friend.
export const GET = socialRoute({}, ({ user, searchParams }) => searchPeople(user.id, searchParams.get("q")));
