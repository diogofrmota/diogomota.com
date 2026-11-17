import type { Page } from "@playwright/test";

export async function mockFixtures(page: Page) {
  await page.route("**/api/benfica/fixtures", (route) =>
    route.fulfill({
      json: {
        data: {
          updatedAt: new Date().toISOString(),
          stale: false,
          matches: [
            {
              id: 1,
              kickoff: new Date(Date.now() + 86400000).toISOString(),
              confirmedTime: true,
              home: true,
              homeTeam: "Benfica",
              awayTeam: "An opponent with a long name for a small screen",
              competition: "Liga Portugal",
            },
            {
              id: 2,
              kickoff: new Date(Date.now() + 604800000).toISOString(),
              confirmedTime: false,
              home: false,
              homeTeam: "FC Porto",
              awayTeam: "Benfica",
              competition: "Liga Portugal",
            },
          ],
        },
      },
    }),
  );
}
