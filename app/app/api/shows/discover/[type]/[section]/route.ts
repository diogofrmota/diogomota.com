import { discoverSection, mediaType, showsRoute } from "@/lib/shows";

// GET /api/shows/discover/{tv|movie}/{section}: a Discover section (lib/show-types.ts, discoverSections).
export const GET = showsRoute({}, ({ user, params }) =>
  discoverSection(user.id, mediaType(params.type), params.section),
);
