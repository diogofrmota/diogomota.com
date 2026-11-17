import { getSession } from "@/auth";
import { query } from "@/lib/db";
import { listEvents } from "@/lib/events";
import { readFitness } from "@/lib/fitness";
import { listRecipes, listShopping } from "@/lib/recipes";
import { readSpace, transaction } from "@/lib/spaces";
import { readLists } from "@/lib/tasks";

// GET /api/account/export: everything the site keeps about you, as a JSON file
// (Account, Data / Privacy page): your account, your Shows library, friends and
// recommendations, what you did (the activity feeds), your space's calendar
// and tasks, which you share with its members, your recipes and shopping list,
// and your fitness log (routines, workouts, runs, supplements, the days logged
// and the goals). Not the password, sessions, profile picture (that one is on
// your Account page to save) or recipes' photos (each recipe lists its photos' links).
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Please log in again." }, { status: 401 });
  const userId = session.user.id;

  const [account, library, friends, recommendations, activity, space, recipes, shopping, fitness] = await Promise.all([
    query(
      `SELECT username, name, email, email_verified AS "emailVerified", theme_preference AS theme,
         created_at AS "createdAt", avatar_updated_at AS "pictureSetAt"
       FROM users WHERE id = $1`,
      [userId],
    ),
    query(
      `SELECT s.type, s.tmdb_id AS "tmdbId", s.title, s.year, us.status, us.current_season AS "currentSeason",
         us.current_episode AS "currentEpisode", us.is_favourite AS "isFavourite", us.updated_at AS "updatedAt"
       FROM user_shows us JOIN shows s ON s.id = us.show_id WHERE us.user_id = $1 ORDER BY us.updated_at DESC`,
      [userId],
    ),
    query(
      `SELECT u.username, u.name, f.status, CASE WHEN f.user_id = $1 THEN 'sent' ELSE 'received' END AS request,
         f.created_at AS "since"
       FROM friendships f JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
       WHERE f.user_id = $1 OR f.friend_id = $1 ORDER BY u.username`,
      [userId],
    ),
    query(
      `SELECT CASE WHEN r.from_user = $1 THEN 'sent' ELSE 'received' END AS direction,
         u.username AS "with", s.type, s.tmdb_id AS "tmdbId", s.title, r.created_at AS "at"
       FROM recommendations r JOIN shows s ON s.id = r.show_id
         JOIN users u ON u.id = CASE WHEN r.from_user = $1 THEN r.to_user ELSE r.from_user END
       WHERE r.from_user = $1 OR r.to_user = $1 ORDER BY r.created_at DESC`,
      [userId],
    ),
    query(
      `SELECT kind, data - 'key' AS data, created_at AS "at" FROM activity WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    ),
    readSpace(userId),
    listRecipes(userId),
    listShopping(userId),
    readFitness(userId),
  ]);

  const shared = space
    ? await transaction(async (db) => ({
        members: space.members.map(({ username, name, role }) => ({ username, name, role })),
        events: await listEvents(db, space),
        taskLists: await readLists(db, space),
      }))
    : null;

  const data = {
    exportedAt: new Date().toISOString(),
    account: account.rows[0],
    shows: { library: library.rows, friends: friends.rows, recommendations: recommendations.rows },
    shared,
    recipes: {
      recipes: recipes.map(({ photos, ...recipe }) => ({
        ...recipe,
        photos: photos.map((photo) => `/api/recipes/photos/${photo.id}`),
      })),
      shoppingList: shopping.map(({ text, isChecked, recipeId }) => ({ text, isChecked, recipeId })),
    },
    fitness,
    activity: activity.rows,
  };
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="diogomota-data-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
