import { Request, Response } from "express";
import { octokit, publicOctokit } from "../lib/github";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { cached, cacheKeys, cacheTTL } from "../lib/cache";

const findIssuesSchema = z.object({
  labels: z.string().optional(),
  language: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  perPage: z.coerce.number().int().min(1).max(30).optional().default(24),
});

const MAX_PAGES = 10;
const TRENDING_REPO_LIMIT = 12;
const MAX_REPO_TERMS_IN_ISSUE_QUERY = 5;
const RECENT_DAYS = 21;
const DEFAULT_MAX_COMMENTS = 25;
const MIN_ISSUE_AGE_MINUTES = 60;
const SEARCH_PER_CHUNK = 30;
const RESULT_BUFFER = 8;

type SearchIssueItem = Awaited<
  ReturnType<typeof octokit.search.issuesAndPullRequests>
>["data"]["items"][number];

type PopularRepo = {
  fullName: string;
  stars: number;
};

function isBadCredentialsError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { status?: number; message?: string };
  return (
    maybeError.status === 401 &&
    typeof maybeError.message === "string" &&
    maybeError.message.toLowerCase().includes("bad credentials")
  );
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as {
    status?: number;
    message?: string;
    response?: { headers?: Record<string, string | undefined> };
  };

  const message = maybeError.message?.toLowerCase() ?? "";
  const remaining = maybeError.response?.headers?.["x-ratelimit-remaining"];

  return (
    maybeError.status === 403 &&
    (message.includes("rate limit") || remaining === "0")
  );
}

async function withPublicFallback<T>(
  operation: (client: Octokit) => Promise<T>,
  client: Octokit,
): Promise<{ data: T; client: Octokit }> {
  try {
    const data = await operation(client);
    return { data, client };
  } catch (error) {
    const shouldFallback =
      client !== publicOctokit &&
      (isBadCredentialsError(error) || isRateLimitError(error));

    if (shouldFallback) {
      try {
        const data = await operation(publicOctokit);
        return { data, client: publicOctokit };
      } catch (publicError) {
        throw publicError;
      }
    }
    throw error;
  }
}

function getIsoDateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function isOlderThanMinimumAge(dateString?: string) {
  if (!dateString) return false;
  const issueDate = new Date(dateString).getTime();
  if (Number.isNaN(issueDate)) return false;

  const minAgeMs = MIN_ISSUE_AGE_MINUTES * 60 * 1000;
  return Date.now() - issueDate >= minAgeMs;
}

function pickAgedIssues<T extends { created_at?: string }>(issues: T[]) {
  return issues.filter((issue) => isOlderThanMinimumAge(issue.created_at));
}

function parseLabelFilters(labels?: string): string[] {
  if (!labels) return [];

  return labels
    .split(",")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
}

function getIssueLabelNames(issue: SearchIssueItem): string[] {
  return issue.labels.map((label) => label.name.toLowerCase());
}

function matchesRequestedLabels(
  issue: SearchIssueItem,
  requestedLabels: string[],
) {
  if (requestedLabels.length === 0) return true;

  const issueLabels = getIssueLabelNames(issue);
  return requestedLabels.some((requested) => issueLabels.includes(requested));
}

function isIssueItem(issue: SearchIssueItem): boolean {
  return !("pull_request" in issue);
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function getRepositoryNameFromUrl(repositoryUrl: string): string {
  const parts = repositoryUrl.split("/");
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

function buildIssueQuery(params: {
  repoFullNames?: string[];
  labels?: string;
  includeRecentWindow?: boolean;
  includeCommentCap?: boolean;
}) {
  const recentSince = getIsoDateDaysAgo(RECENT_DAYS);
  const parts: string[] = ["is:issue", "state:open"];

  if (params.includeRecentWindow ?? true) {
    parts.push(`created:>=${recentSince}`);
  }

  if (params.includeCommentCap ?? true) {
    parts.push(`comments:<=${DEFAULT_MAX_COMMENTS}`);
  }

  if (params.repoFullNames && params.repoFullNames.length > 0) {
    const repoQuery = params.repoFullNames
      .slice(0, MAX_REPO_TERMS_IN_ISSUE_QUERY)
      .map((name) => `repo:${name}`)
      .join(" OR ");
    parts.push(`(${repoQuery})`);
  }

  if (params.labels) {
    const labelQueries = params.labels
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label) => `label:"${label}"`);

    parts.push(...labelQueries);
  }

  return parts.join(" ");
}

function sortIssuesByRepoPopularity(
  issues: SearchIssueItem[],
  repoStarsByName: Map<string, number>,
) {
  return issues.sort((left, right) => {
    const leftRepoStars =
      repoStarsByName.get(getRepositoryNameFromUrl(left.repository_url)) ?? 0;
    const rightRepoStars =
      repoStarsByName.get(getRepositoryNameFromUrl(right.repository_url)) ?? 0;

    if (leftRepoStars !== rightRepoStars) {
      return rightRepoStars - leftRepoStars;
    }

    return (
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
  });
}

async function getPopularRepos(
  client: Octokit,
  language?: string,
): Promise<{ repos: PopularRepo[]; client: Octokit }> {
  const queryParts = [
    "stars:>5000",
    "forks:>300",
    "archived:false",
    "mirror:false",
    "fork:false",
  ];

  if (language) {
    queryParts.push(`language:${language}`);
  }

  const popularQuery = queryParts.join(" ");
  const popularResult = await withPublicFallback(
    (activeClient) =>
      activeClient.search.repos({
        q: popularQuery,
        sort: "stars",
        order: "desc",
        per_page: TRENDING_REPO_LIMIT,
        page: 1,
      }),
    client,
  );

  const uniquePopular = Array.from(
    new Map(
      popularResult.data.data.items.map((repo) => [
        repo.full_name,
        {
          fullName: repo.full_name,
          stars: repo.stargazers_count,
        },
      ]),
    ).values(),
  );

  if (uniquePopular.length > 0) {
    return { repos: uniquePopular, client: popularResult.client };
  }

  const fallbackQuery = language
    ? `stars:>1500 archived:false language:${language}`
    : "stars:>1500 archived:false";
  const fallback = await withPublicFallback(
    (activeClient) =>
      activeClient.search.repos({
        q: fallbackQuery,
        sort: "stars",
        order: "desc",
        per_page: TRENDING_REPO_LIMIT,
        page: 1,
      }),
    popularResult.client,
  );

  return {
    repos: fallback.data.data.items.map((repo) => ({
      fullName: repo.full_name,
      stars: repo.stargazers_count,
    })),
    client: fallback.client,
  };
}

export const findIssues = async (req: Request, res: Response) => {
  try {
    const { labels, language, page, perPage } = findIssuesSchema.parse(
      req.query,
    );

    const effectivePage = Math.min(page, MAX_PAGES);

    const result = await cached(
      cacheKeys.findIssues(
        language || "",
        labels || "",
        effectivePage,
        perPage,
      ),
      cacheTTL.findIssues,
      async () => {
        const requestedLabels = parseLabelFilters(labels);
        const popularReposResult = await getPopularRepos(octokit, language);
        const repoFullNames = popularReposResult.repos.map(
          (repo) => repo.fullName,
        );
        const repoStarsByName = new Map(
          popularReposResult.repos.map((repo) => [repo.fullName, repo.stars]),
        );
        let githubClient = popularReposResult.client;
        const requiredCount = Math.min(
          perPage * MAX_PAGES,
          effectivePage * perPage + RESULT_BUFFER,
        );

        const searchAcrossPopularRepos = async (params: {
          includeRecentWindow?: boolean;
          includeCommentCap?: boolean;
        }) => {
          const repoChunks = chunkArray(
            repoFullNames,
            MAX_REPO_TERMS_IN_ISSUE_QUERY,
          );
          const collected: SearchIssueItem[] = [];
          const uniqueByUrl = new Map<string, SearchIssueItem>();

          for (const repoChunk of repoChunks) {
            const query = buildIssueQuery({
              repoFullNames: repoChunk,
              labels,
              includeRecentWindow: params.includeRecentWindow,
              includeCommentCap: params.includeCommentCap,
            });

            let chunkItems: SearchIssueItem[] = [];
            try {
              const searchResult = await withPublicFallback(
                (activeClient) =>
                  activeClient.search.issuesAndPullRequests({
                    q: query,
                    sort: "created",
                    order: "desc",
                    page: 1,
                    per_page: SEARCH_PER_CHUNK,
                  }),
                githubClient,
              );

              githubClient = searchResult.client;
              chunkItems = searchResult.data.data.items;
            } catch (chunkError) {
              // 422 means one or more repos in the chunk can't be searched
              // (e.g. issues disabled, repo removed/private). Retry each
              // repo individually so we only skip the truly unsearchable ones.
              if (
                typeof chunkError === "object" &&
                chunkError !== null &&
                (chunkError as { status?: number }).status === 422 &&
                repoChunk.length > 1
              ) {
                for (const singleRepo of repoChunk) {
                  try {
                    const singleQuery = buildIssueQuery({
                      repoFullNames: [singleRepo],
                      labels,
                      includeRecentWindow: params.includeRecentWindow,
                      includeCommentCap: params.includeCommentCap,
                    });
                    const singleResult = await withPublicFallback(
                      (activeClient) =>
                        activeClient.search.issuesAndPullRequests({
                          q: singleQuery,
                          sort: "created",
                          order: "desc",
                          page: 1,
                          per_page: SEARCH_PER_CHUNK,
                        }),
                      githubClient,
                    );
                    githubClient = singleResult.client;
                    chunkItems.push(...singleResult.data.data.items);
                  } catch {
                    // Skip unsearchable repo silently
                  }
                }
              } else if (
                typeof chunkError === "object" &&
                chunkError !== null &&
                (chunkError as { status?: number }).status === 422
              ) {
                // Single-repo chunk that is unsearchable — skip it
              } else {
                throw chunkError;
              }
            }

            collected.push(...chunkItems);

            for (const issue of collected) {
              if (!uniqueByUrl.has(issue.html_url)) {
                uniqueByUrl.set(issue.html_url, issue);
              }
            }

            const currentCount = Array.from(uniqueByUrl.values())
              .filter(isIssueItem)
              .filter((issue) => matchesRequestedLabels(issue, requestedLabels))
              .filter((issue) =>
                isOlderThanMinimumAge(issue.created_at),
              ).length;

            if (currentCount >= requiredCount) {
              break;
            }
          }

          const agedItems = pickAgedIssues(Array.from(uniqueByUrl.values()))
            .filter(isIssueItem)
            .filter((issue) => matchesRequestedLabels(issue, requestedLabels));

          return sortIssuesByRepoPopularity(agedItems, repoStarsByName);
        };

        let issues = await searchAcrossPopularRepos({
          includeRecentWindow: true,
          includeCommentCap: true,
        });

        if (issues.length === 0) {
          issues = await searchAcrossPopularRepos({
            includeRecentWindow: true,
            includeCommentCap: false,
          });
        }

        if (issues.length === 0) {
          issues = await searchAcrossPopularRepos({
            includeRecentWindow: false,
            includeCommentCap: false,
          });
        }

        const cappedTotal = Math.min(issues.length, perPage * MAX_PAGES);
        const startIndex = (effectivePage - 1) * perPage;
        const paginatedIssues = issues.slice(startIndex, startIndex + perPage);

        return {
          page: effectivePage,
          perPage,
          total: cappedTotal,
          issues: paginatedIssues,
        };
      },
    );

    res.status(200).json(result);
  } catch (error) {
    console.error(
      "Error fetching issues from Github: ",
      JSON.stringify(error, null, 2),
    );
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Invalid query parameters",
        errors: error.issues,
      });
    }

    if (isRateLimitError(error)) {
      return res.status(200).json({
        page: 1,
        perPage: findIssuesSchema.parse(req.query).perPage,
        total: 0,
        issues: [],
        warning: "GitHub rate limit reached. Please retry in a few minutes.",
      });
    }

    res.status(500).json({
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
