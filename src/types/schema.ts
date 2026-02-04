import { z } from "zod";

export const RepoSchema = z.object({
  github_id: z.number().int().positive(),
  owner: z.string().max(256),
  repo_name: z.string().max(256),
  full_name: z.string().max(256),
  url: z.string().url(),
  description: z.string().nullable(),
  language: z.string().max(100).nullable(),
  stargazers_count: z.number().int().nonnegative().default(0),
  forks_count: z.number().int().nonnegative().default(0),
  watchers_count: z.number().int().nonnegative().default(0),
  open_issues_count: z.number().int().nonnegative().default(0),
  created_at: z.coerce.date().nullable(),
  updated_at: z.coerce.date().nullable(),
  last_synced_at: z.coerce.date(),
});

export type RepoData = z.infer<typeof RepoSchema>;
