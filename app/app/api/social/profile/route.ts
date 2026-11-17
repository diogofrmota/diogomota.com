import { readSocialProfile, socialRoute } from "@/lib/social";
export const GET = socialRoute({}, ({ user }) => readSocialProfile(user.id));
