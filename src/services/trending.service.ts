import { db } from '@/db/client';
import { trending_repos } from '@/db/schemas/trending';
import { eq } from 'drizzle-orm';

export const getTrendingRepos = async (period: string) => {
  const results = await db.query.trending_repos.findMany({
    where: period === 'all' ? undefined : (t, { eq }) => eq(t.period, period),
    with: {
      repo: {
        with: {
          tags: {
            with: {
              tag: true,
            },
          },
        },
      },
    },
  });

  //sample data that needs to be simplified
  //
  // Item 1
  //  {
  //    "repo_id": 101,
  //    "period": "daily",
  //    "stars_earned": 250,
  //    "repo": {
  //      "id": 101,
  //      "full_name": "owner/repo-one",
  //     "description": "A great project",
  //     "tags": [
  //       { "repo_id": 101, "tag_id": 1, "tag": { "id": 1, "name": "react" }
  // },
  //       { "repo_id": 101, "tag_id": 2, "tag": { "id": 2, "name":
  // "typescript" } }
  //     ]
  //   }
  // },
  const cleanData = results.map((row) => {
    if (!row.repo) return null;
    return {
      ...row.repo,
      tags: row.repo.tags.map((tagRow) => {
        return tagRow.tag.name;
      }),
    };
  });
  return cleanData;
};

export const updateTrendingRepos = async (
  repo_id: number,
  period: string,
  stars_earned: number
) => {
  const result = await db
    .insert(trending_repos)
    .values({
      repo_id: repo_id,
      period: period,
      stars_earned: stars_earned,
      created_at: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: trending_repos.id });

  return result[0]?.id;
};

export const clearOldTrending = async (category: string) => {
  const period = category;
  await db.delete(trending_repos).where(eq(trending_repos.period, period));
};
