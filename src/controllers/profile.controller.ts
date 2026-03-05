import { Request, Response } from "express";
import { octokit, publicOctokit } from "../lib/github";
import { Octokit } from "@octokit/rest";
import { cached, cacheKeys, cacheTTL } from "../lib/cache";

type Contribution = {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
};

type ContributionsApiResponse = {
  total: Record<string, number>;
  contributions: Contribution[];
};

type GitHubPublicRepo = {
  language: string | null;
};

type GitHubPublicEvent = {
  type: string;
  created_at: string;
  payload?: {
    commits?: Array<unknown>;
  };
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

async function withPublicFallback<T>(
  operation: (client: Octokit) => Promise<T>,
  client: Octokit,
): Promise<{ data: T; client: Octokit }> {
  try {
    const data = await operation(client);
    return { data, client };
  } catch (error) {
    if (client !== publicOctokit && isBadCredentialsError(error)) {
      const data = await operation(publicOctokit);
      return { data, client: publicOctokit };
    }
    throw error;
  }
}

function getSettledData<T>(
  result: PromiseSettledResult<{ data: T }>,
  fallback: T,
): T {
  if (result.status === "fulfilled") return result.value.data;
  return fallback;
}

async function fetchPublicRepos(username: string): Promise<GitHubPublicRepo[]> {
  const reposRes = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?type=owner&sort=updated&per_page=100`,
  );
  if (!reposRes.ok) return [];
  return (await reposRes.json()) as GitHubPublicRepo[];
}

async function fetchPublicEvents(
  username: string,
): Promise<GitHubPublicEvent[]> {
  const eventsRes = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=100`,
  );
  if (!eventsRes.ok) return [];
  return (await eventsRes.json()) as GitHubPublicEvent[];
}

export const getProfile = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    if (!username) {
      res.status(400).json({ error: "Username is required" });
      return;
    }

    const profileResult = await cached(
      cacheKeys.profile(username),
      cacheTTL.profile,
      async () => {
        let githubClient: Octokit = octokit;

        const userResponse = await withPublicFallback(
          (client) =>
            client.rest.users.getByUsername({
              username,
            }),
          githubClient,
        );

        const { data: user } = userResponse.data;
        githubClient = userResponse.client;

        const profileData = {
          username: user.login,
          user: {
            name: user.name,
            login: user.login,
            avatarUrl: user.avatar_url,
            bio: user.bio,
            followers: user.followers,
            following: user.following,
            createdAt: user.created_at,
            htmlUrl: user.html_url,
          },
        };

        const [
          reposRes,
          commitsRes,
          prsRes,
          mergedPrsRes,
          openPrsRes,
          issuesRes,
          reviewsRes,
          contributionsRes,
        ] = await Promise.allSettled([
          githubClient.rest.repos.listForUser({
            username: profileData.username,
            sort: "updated",
            per_page: 100,
            type: "owner",
          }),

          githubClient.rest.search.commits({
            q: `author:${profileData.username}`,
            headers: { Accept: "application/vnd.github.cloak-preview" },
          }),

          githubClient.rest.search.issuesAndPullRequests({
            q: `author:${profileData.username} type:pr`,
          }),

          githubClient.rest.search.issuesAndPullRequests({
            q: `author:${profileData.username} type:pr is:merged`,
          }),

          githubClient.rest.search.issuesAndPullRequests({
            q: `author:${profileData.username} type:pr is:open`,
          }),

          githubClient.rest.search.issuesAndPullRequests({
            q: `author:${profileData.username} type:issue`,
          }),

          githubClient.rest.search.issuesAndPullRequests({
            q: `reviewed-by:${profileData.username} type:pr`,
          }),

          fetch(
            `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(profileData.username)}?y=last`,
          ),
        ]);

        let contributions: Contribution[] = [];
        let contributionsTotal: Record<string, number> = {};

        if (
          contributionsRes.status === "fulfilled" &&
          contributionsRes.value.ok
        ) {
          const contributionsJson =
            (await contributionsRes.value.json()) as ContributionsApiResponse;
          contributions = contributionsJson.contributions ?? [];
          contributionsTotal = contributionsJson.total ?? {};
        }

        const reposData = getSettledData(
          reposRes,
          [] as Awaited<
            ReturnType<typeof octokit.rest.repos.listForUser>
          >["data"],
        );
        const commitsData = getSettledData(commitsRes, {
          total_count: 0,
        } as Awaited<ReturnType<typeof octokit.rest.search.commits>>["data"]);
        const prsData = getSettledData(prsRes, {
          total_count: 0,
        } as Awaited<
          ReturnType<typeof octokit.rest.search.issuesAndPullRequests>
        >["data"]);
        const mergedPrsData = getSettledData(mergedPrsRes, {
          total_count: 0,
        } as Awaited<
          ReturnType<typeof octokit.rest.search.issuesAndPullRequests>
        >["data"]);
        const openPrsData = getSettledData(openPrsRes, {
          total_count: 0,
        } as Awaited<
          ReturnType<typeof octokit.rest.search.issuesAndPullRequests>
        >["data"]);
        const issuesData = getSettledData(issuesRes, {
          total_count: 0,
        } as Awaited<
          ReturnType<typeof octokit.rest.search.issuesAndPullRequests>
        >["data"]);
        const reviewsData = getSettledData(reviewsRes, {
          total_count: 0,
        } as Awaited<
          ReturnType<typeof octokit.rest.search.issuesAndPullRequests>
        >["data"]);

        const hasSearchFailure =
          commitsRes.status === "rejected" ||
          prsRes.status === "rejected" ||
          issuesRes.status === "rejected" ||
          reviewsRes.status === "rejected";

        let effectiveRepos = reposData;
        if (!effectiveRepos.length) {
          const fallbackRepos = await fetchPublicRepos(profileData.username);
          if (fallbackRepos.length) {
            effectiveRepos = fallbackRepos as typeof reposData;
          }
        }

        const events = hasSearchFailure
          ? await fetchPublicEvents(profileData.username)
          : [];

        const languagesMap: Record<string, number> = {};
        effectiveRepos.forEach((repo) => {
          if (repo.language) {
            languagesMap[repo.language] =
              (languagesMap[repo.language] || 0) + 1;
          }
        });

        const contributionCommits = Object.values(contributionsTotal).reduce(
          (sum, count) => sum + count,
          0,
        );
        const eventPrs = events.filter(
          (event) => event.type === "PullRequestEvent",
        ).length;
        const eventIssues = events.filter(
          (event) => event.type === "IssuesEvent",
        ).length;
        const eventReviews = events.filter(
          (event) => event.type === "PullRequestReviewEvent",
        ).length;
        const eventCommits = events
          .filter((event) => event.type === "PushEvent")
          .reduce(
            (sum, event) => sum + (event.payload?.commits?.length ?? 0),
            0,
          );

        const totalPrs =
          prsRes.status === "fulfilled" ? prsData.total_count : eventPrs;
        const mergedPrs = mergedPrsData.total_count;
        const openPrs = openPrsData.total_count;
        const closedPrs = Math.max(0, totalPrs - mergedPrs - openPrs);
        const totalCommits =
          commitsRes.status === "fulfilled"
            ? commitsData.total_count
            : Math.max(contributionCommits, eventCommits);
        const totalIssues =
          issuesRes.status === "fulfilled"
            ? issuesData.total_count
            : eventIssues;
        const totalReviews =
          reviewsRes.status === "fulfilled"
            ? reviewsData.total_count
            : eventReviews;

        // Calculate activity history for last 12 months
        const activityHistory = [];
        const monthNames = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const now = new Date();

        for (let i = 11; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const monthName = monthNames[date.getMonth()];

          const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
          const endDate = new Date(year, month, 0);
          const endDateStr = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

          try {
            const monthPrs =
              await githubClient.rest.search.issuesAndPullRequests({
                q: `author:${profileData.username} type:pr created:${startDate}..${endDateStr}`,
                per_page: 1,
              });

            const monthIssues =
              await githubClient.rest.search.issuesAndPullRequests({
                q: `author:${profileData.username} type:issue created:${startDate}..${endDateStr}`,
                per_page: 1,
              });

            activityHistory.push({
              month: monthName,
              prs: monthPrs.data.total_count,
              issues: monthIssues.data.total_count,
            });
          } catch (error) {
            activityHistory.push({
              month: monthName,
              prs: 0,
              issues: 0,
            });
          }
        }

        const topLanguagues = Object.entries(languagesMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([langName, value]) => ({
            langName,
            value,
          }));

        const repsonseData = {
          ...profileData,
          stats: {
            totalCommits: totalCommits,
            totalPrs: totalPrs,
            totalIssues: totalIssues,
            totalReviews: totalReviews,
          },
          graphs: {
            languages: topLanguagues,
            radar: {
              commits: totalCommits,
              prs: totalPrs,
              issues: totalIssues,
              reviews: totalReviews,
            },
            prStats: {
              merged: mergedPrs,
              open: openPrs,
              closed: closedPrs,
            },
            activityHistory: activityHistory,
            contributionCalendar: contributions,
            contributionTotals: contributionsTotal,
          },
        };
        return repsonseData;
      },
    );

    res.json(profileResult);
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message || "Failed to fetch profile" });
  }
};
