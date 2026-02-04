import { db } from "@/db/client";
import { repos } from "@/db/schemas/repos";
import { InferInsertModel } from "drizzle-orm";

type RepoType = InferInsertModel<typeof repos>;

export const upsertRepo = async (data: RepoType) => {
  const inserted = await db
    .insert(repos)
    .values({ ...data })
    .onConflictDoUpdate({
      target: repos.github_id,
      set: {
        stargazers_count: data.stargazers_count,
        forks_count: data.forks_count,
        last_synced_at: new Date(),
        watchers_count: data.watchers_count,
        open_issues_count: data.open_issues_count,
        updated_at: data.updated_at,
      },
    })
    .returning({ id: repos.id });

  return inserted[0].id;
};
