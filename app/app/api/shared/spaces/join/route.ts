import { apiRoute, HttpError } from "@/lib/http";
import { spaceJoinLimit } from "@/lib/rate-limit";
import { joinInput } from "@/lib/schemas";
import { joinSpace } from "@/lib/spaces";

// POST /api/shared/spaces/join {code}: joins the space of an invite code, which
// is then used up. 20 attempts per 15 minutes: codes are short.
export const POST = apiRoute({ label: "Joining a space", body: joinInput }, ({ user, body }) => {
  if (!spaceJoinLimit(user.id)) throw new HttpError("Too many attempts. Try again in 15 minutes.", 429);
  return joinSpace(user.id, body.code);
});
