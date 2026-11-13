import { apiRoute } from "@/lib/http";
import { createSpace, readSpace } from "@/lib/spaces";

// GET /api/shared/spaces: your space ({id, ownerId, members}), or null without one.
export const GET = apiRoute({ label: "Reading a space" }, ({ user }) => readSpace(user.id));

// POST /api/shared/spaces {}: creates a space with you in it (409 if you have one).
export const POST = apiRoute({ label: "Creating a space" }, ({ user }) => createSpace(user.id));
