import { socialActivity } from "@/lib/activity";
import { socialRoute } from "@/lib/social";
export const GET = socialRoute({}, ({ user }) => socialActivity(user.id));
