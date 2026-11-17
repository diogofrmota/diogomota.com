import { apiRoute } from "@/lib/http";
import { fixtureInput } from "@/lib/benfica-types";
import { deleteFixture, readFixture, saveFixture } from "@/lib/benfica";
import { benficaRequestLimit } from "@/lib/rate-limit";

export const GET = apiRoute({ label: "Loading a match", limit: benficaRequestLimit }, ({ user, params }) =>
  readFixture(user.id, params.id),
);
export const PATCH = apiRoute(
  { label: "Updating a match", body: fixtureInput, limit: benficaRequestLimit },
  ({ user, params, body }) => saveFixture(user.id, body, params.id),
);
export const DELETE = apiRoute({ label: "Deleting a match", limit: benficaRequestLimit }, ({ user, params }) =>
  deleteFixture(user.id, params.id),
);
