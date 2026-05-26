import { db } from "../db/client";
import { user, tracked_prs, tracked_issues, account } from "../db/schemas";
import { eq, and } from "drizzle-orm";
import axios from "axios";

export interface ContributorRanking {
    id: string;
    name: string;
    avatarUrl: string;
    score: number;
    mergedPRs: number;
    openPRs: number;
    issues: number;
    username: string;
    bio?: string | null;
}

// In-memory cache for mapping user IDs to GitHub login names and bios
interface UserMeta {
    username: string;
    bio: string | null;
}
const userMetaCache = new Map<string, UserMeta>();

export async function getContributorRankings(): Promise<ContributorRanking[]> {
    // Get all users
    const users = await db.select().from(user);

    // Aggregate stats and metadata in parallel for maximum speed
    const rankings = await Promise.all(
        users.map(async (u) => {
            // Fetch PRs, Issues and Github Account in parallel
            const [prs, issues, githubAccount] = await Promise.all([
                db.select().from(tracked_prs).where(eq(tracked_prs.user_id, u.id)),
                db.select().from(tracked_issues).where(eq(tracked_issues.user_id, u.id)),
                db.query.account.findFirst({
                    where: and(eq(account.userId, u.id), eq(account.providerId, "github")),
                }),
            ]);

            const localMerged = localPrs.filter((pr) => pr.state === "merged").length;
            const localOpen = localPrs.filter((pr) => pr.state === "open").length;
            const localScore = localMerged * 10 + localOpen * 2 + localIssues.length * 1;

            // Resolve GitHub login username and bio
            let githubUsername = "";
            let githubBio: string | null = null;

            if (userMetaCache.has(u.id)) {
                const cachedMeta = userMetaCache.get(u.id)!;
                githubUsername = cachedMeta.username;
                githubBio = cachedMeta.bio;
            } else {
                if (githubAccount?.accountId) {
                    try {
                        // Fetch username and bio using GitHub ID via public endpoint
                        const response = await axios.get(`https://api.github.com/user/${githubAccount.accountId}`, {
                            headers: {
                                "User-Agent": "sourcesurf-backend",
                                ...(process.env.GITHUB_TOKEN ? { Authorization: `token ${process.env.GITHUB_TOKEN}` } : {})
                            }
                        });
                        githubUsername = response.data.login;
                        githubBio = response.data.bio || null;
                        if (githubUsername) {
                            userMetaCache.set(u.id, { username: githubUsername, bio: githubBio });
                        }
                    } catch (err) {
                        console.error(`Failed to fetch github metadata for user ${u.id}:`, err);
                    }
                }

                // If not resolved from GitHub API (e.g., credential user or rate limit), use tracked data fallback
                if (!githubUsername) {
                    if (prs.length > 0) {
                        githubUsername = prs[0].author;
                    } else if (issues.length > 0) {
                        githubUsername = issues[0].author;
                    }
                }
            }
            if (!githubUsername) {
                githubUsername = u.name.replace(/\s+/g, "").toLowerCase();
            }

            return {
                id: u.id,
                name: u.name,
                avatarUrl: u.image || "",
                score: u.score || localScore,
                mergedPRs: u.mergedPRs || localMerged,
                openPRs: u.openPRs || localOpen,
                issues: u.issues || localIssues.length,
                username: githubUsername,
                bio: u.githubBio,
            };
        })
    );

    rankings.sort((a, b) => b.score - a.score);
    return rankings;
}
