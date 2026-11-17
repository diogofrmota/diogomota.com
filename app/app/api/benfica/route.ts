import { apiRoute } from "@/lib/http";
import { fixtureInput } from "@/lib/benfica-types";
import { listFixtures, saveFixture } from "@/lib/benfica";
import { benficaRequestLimit } from "@/lib/rate-limit";

export const GET = apiRoute({ label: "Loading Benfica fixtures", limit: benficaRequestLimit }, ({ user }) =>
  listFixtures(user.id),
);
export const POST = apiRoute(
  { label: "Adding a match", body: fixtureInput, status: 201, limit: benficaRequestLimit },
  ({ user, body }) => saveFixture(user.id, body),
);
