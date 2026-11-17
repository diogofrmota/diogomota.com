import { readSocialProfile, socialRoute } from "@/lib/social";
export const GET = socialRoute({}, ({ user, params }) => readSocialProfile(user.id, params.id));
